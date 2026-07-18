/* MONKE cross-platform inference runtime (streaming server over stdin/stdout).
 * Disk-routed recurrent LM: controller in RAM, int8 product-key table on disk,
 * 2 rows/token read unbuffered (O_DIRECT / F_NOCACHE / unbuffered ReadFile).
 *
 * Protocol (stdin lines -> stdout lines):
 *   RESET                     -> clear recurrent state (new chat)
 *   PROMPT <id> <id> ...      -> feed tokens into state (no generation)
 *   GEN <max>                 -> greedy-generate up to max tokens or </s>;
 *                                emits "T <id>" per token, then
 *                                "E <tok_s> <io_bytes_per_token> <rss_mb>"
 *   PING                      -> "PONG"
 * Args: controller.bin mem.i8 scale [threads]
 */
#define _GNU_SOURCE
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _OPENMP
#include <omp.h>
#endif

#if defined(_WIN32)
  #include <io.h>
  #include <fcntl.h>
  #include <windows.h>
  #include <psapi.h>
  typedef long long off64;
#else
  #include <fcntl.h>
  #include <unistd.h>
  typedef off_t off64;
#endif

/* Monotonic clock in seconds. POSIX clock_gettime isn't available under MSVC,
 * so use QueryPerformanceCounter on Windows. */
#if defined(_WIN32)
static double now(){LARGE_INTEGER f,c;QueryPerformanceFrequency(&f);QueryPerformanceCounter(&c);return (double)c.QuadPart/(double)f.QuadPart;}
#else
static double now(){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec*1e-9;}
#endif
static float sg(float x){return 1.f/(1.f+expf(-x));}
static float silu(float x){return x*sg(x);}
static void die(const char*s){fprintf(stderr,"[monke] fatal: %s\n",s);exit(1);}

int V,D,L,FF,A,B;
typedef struct{float*n1w,*n1b,*proj,*o,*n2w,*n2b,*up,*down,*decay;}Blk;
float*embed,*normw,*normb,*ra,*rb,*ca,*cb; Blk*blk;
static float* rd(FILE*f,long n){float*p=malloc((size_t)n*4);if(!p||fread(p,4,n,f)!=(size_t)n)die("read weights");return p;}
static void mv(const float*W,const float*x,float*y,int rows,int cols){
  int r;
  #pragma omp parallel for schedule(static)
  for(r=0;r<rows;r++){const float*w=W+(size_t)r*cols;float s=0;for(int c=0;c<cols;c++)s+=w[c]*x[c];y[r]=s;}
}
static void lnorm(const float*x,const float*w,const float*b,float*y){
  float m=0,v=0;for(int i=0;i<D;i++)m+=x[i];m/=D;for(int i=0;i<D;i++){float q=x[i]-m;v+=q*q;}
  float inv=1.f/sqrtf(v/D+1e-5f);for(int i=0;i<D;i++)y[i]=(x[i]-m)*inv*w[i]+b[i];
}
static void top2(const float*x,int n,int*i0,int*i1){*i0=0;*i1=1;if(x[1]>x[0]){*i0=1;*i1=0;}
  for(int i=2;i<n;i++){if(x[i]>x[*i0]){*i1=*i0;*i0=i;}else if(x[i]>x[*i1])*i1=i;}}

/* ---- unbuffered disk read of one page containing an int8 row ---- */
float scale; uint64_t io_total=0;
#if defined(_WIN32)
static HANDLE hfile; 
static void open_table(const char*p){
  hfile=CreateFileA(p,GENERIC_READ,FILE_SHARE_READ,0,OPEN_EXISTING,FILE_FLAG_NO_BUFFERING,0);
  if(hfile==INVALID_HANDLE_VALUE) die("open table");
}
static void readrow(uint64_t key,void*pg,float*out){
  long long off=(long long)key*D, base=off & ~4095LL;
  OVERLAPPED ov; memset(&ov,0,sizeof ov); ov.Offset=(DWORD)(base&0xFFFFFFFF); ov.OffsetHigh=(DWORD)(base>>32);
  DWORD got=0; if(!ReadFile(hfile,pg,4096,&got,&ov)||got<4096) die("readrow");
  io_total+=4096; int8_t*r=(int8_t*)pg+(off-base); for(int i=0;i<D;i++)out[i]=r[i]*scale;
}
static double rss_mb(){PROCESS_MEMORY_COUNTERS c; GetProcessMemoryInfo(GetCurrentProcess(),&c,sizeof c); return c.WorkingSetSize/1048576.0;}
#else
static int mfd;
static void open_table(const char*p){
 #if defined(__linux__)
  mfd=open(p,O_RDONLY|O_DIRECT); if(mfd<0) mfd=open(p,O_RDONLY);
 #else
  mfd=open(p,O_RDONLY);
  #if defined(__APPLE__)
  if(mfd>=0) fcntl(mfd,F_NOCACHE,1); /* bypass unified buffer cache */
  #endif
 #endif
  if(mfd<0) die("open table");
}
static void readrow(uint64_t key,void*pg,float*out){
  off64 off=(off64)key*D, base=off & ~4095L;
  if(pread(mfd,pg,4096,base)!=4096) die("readrow");
  io_total+=4096; int8_t*r=(int8_t*)pg+(off-base); for(int i=0;i<D;i++)out[i]=r[i]*scale;
}
static double rss_mb(){
  FILE*f=fopen("/proc/self/status","r"); if(f){char s[256];long k=0;while(fgets(s,256,f))if(sscanf(s,"VmRSS: %ld",&k)==1)break;fclose(f);if(k)return k/1024.0;}
  return 0;
}
#endif

/* ---- persistent state ---- */
float*state; float *x,*h,*q4,*tmp,*xo,*q2,*fin,*xd,*xa,*xb,*r0,*r1,*ext,*feat,*logits;
void*pg0,*pg1;
static void alloc_bufs(){
  state=calloc((size_t)L*D,4);
  x=malloc(D*4);h=malloc(D*4);q4=malloc(4*D*4);tmp=malloc(D*4);xo=malloc(D*4);q2=malloc(2*FF*4);fin=malloc(FF*4);xd=malloc(D*4);
  xa=malloc(A*4);xb=malloc(B*4);r0=malloc(D*4);r1=malloc(D*4);ext=malloc(D*4);feat=malloc(D*4);logits=malloc((size_t)V*4);
  #if defined(_WIN32)
  pg0=_aligned_malloc(4096,4096); pg1=_aligned_malloc(4096,4096);
  #else
  if(posix_memalign(&pg0,4096,4096)||posix_memalign(&pg1,4096,4096)) die("align");
  #endif
}
static void reset_state(){ memset(state,0,(size_t)L*D*4); }

/* run one token through the model; returns argmax id (next token) */
static int step(int tok){
  memcpy(x,embed+(size_t)tok*D,D*4);
  for(int l=0;l<L;l++){Blk*z=&blk[l];float*st=state+(size_t)l*D;
    lnorm(x,z->n1w,z->n1b,h); mv(z->proj,h,q4,4*D,D);
    for(int i=0;i<D;i++){float g=sg(q4[3*D+i]+z->decay[i]);st[i]=g*st[i]+(1-g)*tanhf(q4[i]);tmp[i]=sg(q4[2*D+i])*st[i]*sg(q4[D+i]);}
    mv(z->o,tmp,xo,D,D);for(int i=0;i<D;i++)x[i]+=xo[i];
    lnorm(x,z->n2w,z->n2b,h);mv(z->up,h,q2,2*FF,D);
    for(int i=0;i<FF;i++)fin[i]=silu(q2[FF+i])*q2[i];
    mv(z->down,fin,xd,D,FF);for(int i=0;i<D;i++)x[i]+=xd[i];
  }
  mv(ra,x,xa,A,D);mv(rb,x,xb,B,D);int a0,a1,b0,b1;top2(xa,A,&a0,&a1);top2(xb,B,&b0,&b1);
  float s0=xa[a0]+xb[b0],sa=xa[a1]+xb[b0],sb=xa[a0]+xb[b1],s1;uint64_t k0=(uint64_t)a0*B+b0,k1;
  if(sa>=sb){k1=(uint64_t)a1*B+b0;s1=sa;}else{k1=(uint64_t)a0*B+b1;s1=sb;}
  float e=expf(s1-s0),al1=e/(1+e),al0=1-al1;readrow(k0,pg0,r0);readrow(k1,pg1,r1);
  for(int i=0;i<D;i++)ext[i]=al0*r0[i]+al1*r1[i]+ca[(size_t)a0*D+i]+cb[(size_t)b0*D+i];
  for(int i=0;i<D;i++)tmp[i]=x[i]+ext[i];lnorm(tmp,normw,normb,feat);
  mv(embed,feat,logits,V,D);int best=0;for(int i=1;i<V;i++)if(logits[i]>logits[best])best=i;return best;
}

int main(int ac,char**av){
  if(ac<4){fprintf(stderr,"usage: monke_runtime controller.bin mem.i8 scale [threads]\n");return 2;}
  #ifdef _OPENMP
  if(ac>4) omp_set_num_threads(atoi(av[4]));
  #endif
  FILE*f=fopen(av[1],"rb");if(!f)die("open controller");char mg[4];int hd[6];
  if(fread(mg,1,4,f)!=4||fread(hd,4,6,f)!=6||memcmp(mg,"DCR2",4))die("bad controller header");
  V=hd[0];D=hd[1];L=hd[2];FF=hd[3];A=hd[4];B=hd[5];
  embed=rd(f,(long)V*D); blk=calloc(L,sizeof(Blk));
  for(int l=0;l<L;l++){Blk*z=&blk[l];z->n1w=rd(f,D);z->n1b=rd(f,D);z->proj=rd(f,(long)4*D*D);z->o=rd(f,(long)D*D);z->n2w=rd(f,D);z->n2b=rd(f,D);z->up=rd(f,(long)2*FF*D);z->down=rd(f,(long)D*FF);z->decay=rd(f,D);}
  normw=rd(f,D);normb=rd(f,D);ra=rd(f,(long)A*D);rb=rd(f,(long)B*D);ca=rd(f,(long)A*D);cb=rd(f,(long)B*D);fclose(f);
  scale=strtof(av[3],0); open_table(av[2]); alloc_bufs();
  setvbuf(stdout,NULL,_IOLBF,0);
  fprintf(stdout,"READY %d %d %d %d %d %d\n",V,D,L,FF,A,B); fflush(stdout);

  char*line=NULL; size_t cap=0; char buf[1<<16];
  while(fgets(buf,sizeof buf,stdin)){
    if(!strncmp(buf,"RESET",5)){ reset_state(); fprintf(stdout,"OK\n"); fflush(stdout); continue; }
    if(!strncmp(buf,"PING",4)){ fprintf(stdout,"PONG\n"); fflush(stdout); continue; }
    if(!strncmp(buf,"PROMPT",6)){
      char*p=buf+6; int id, last=-1;
      while(sscanf(p," %d",&id)==1){ last=step(id); while(*p==' ')p++; while(*p&&*p!=' ')p++; }
      fprintf(stdout,"OK %d\n", last); fflush(stdout); continue;
    }
    if(!strncmp(buf,"GEN",3)){
      /* GEN <max> <startTok>  (startTok = the "OK <last>" returned by PROMPT) */
      int maxn=0, cur=-1; sscanf(buf+3," %d %d",&maxn,&cur); if(maxn<=0)maxn=64;
      int tok = cur>=0 ? cur : 2; uint64_t io0=io_total; double t0=now(); int gen=0;
      for(int i=0;i<maxn;i++){ if(tok==2) break; fprintf(stdout,"T %d\n",tok); fflush(stdout); gen++; tok=step(tok); }
      double dt=now()-t0; double io=(double)(io_total-io0)/(gen>0?gen:1);
      fprintf(stdout,"E %.2f %.0f %.1f\n", gen>0?gen/dt:0.0, io, rss_mb()); fflush(stdout); continue;
    }
  }
  (void)line;(void)cap; return 0;
}
