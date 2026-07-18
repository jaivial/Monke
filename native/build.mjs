// Cross-platform native runtime build. Run: node native/build.mjs
//
// Portability: by default we DO NOT use `-march=native`. A binary built with
// `-march=native` embeds instructions specific to the build machine's CPU and
// will crash with SIGILL on an older/different CPU — fatal for a prebuilt that
// ships to other users or travels on a flash drive. Instead we target a broad
// baseline:
//   x64   -> x86-64-v2 (SSE4.2, ~2011+ Intel/AMD): universal and still fast.
//   arm64 -> compiler default baseline (ARMv8-A).
// Power users optimizing for their own machine can override:
//   MONKE_NATIVE_MARCH=native node native/build.mjs
import { execSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { platform, arch } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// Use fileURLToPath, not URL.pathname: on Windows the latter yields a leading
// "/D:/..." that mkdir/gcc mangle into "D:\D:\...". join() also normalizes
// separators per-OS.
const dir = dirname(fileURLToPath(import.meta.url))
mkdirSync(join(dir, 'bin'), { recursive: true })
const src = join(dir, 'monke_runtime.c')
const p = platform()
const a = arch()
const out = join(dir, 'bin', 'monke_runtime' + (p === 'win32' ? '.exe' : ''))

function has(cmd) {
  try {
    // MSVC `cl` has no --version; Windows PATH lookup is enough.
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore', shell: true })
    return true
  } catch { return false }
}

// Portable arch flag (gcc/clang). Override with MONKE_NATIVE_MARCH.
function marchFlag() {
  const override = process.env.MONKE_NATIVE_MARCH
  if (override) return `-march=${override}`
  if (a === 'x64') return '-march=x86-64-v2'   // SSE4.2 baseline, broadly compatible
  return ''                                     // arm64 & others: safe compiler default
}

let cmd
if (p === 'win32') {
  // MSVC (cl) if available, else clang/gcc via MinGW. MSVC targets a portable
  // baseline by default (no /arch:AVX), so nothing extra needed there.
  if (has('cl')) cmd = `cl /O2 /openmp /Fe:"${out}" "${src}" psapi.lib`
  else cmd = `gcc -O3 ${marchFlag()} -fopenmp "${src}" -o "${out}" -lm -lpsapi`
} else if (p === 'darwin') {
  // Apple clang has no OpenMP by default; build single-thread (still fast for one
  // stream). MONKE_MAC_ARCH lets a runner cross-build the other slice, e.g. build
  // the x86_64 binary on Apple Silicon (`-arch x86_64`) — used in CI because
  // GitHub's Intel-mac runners are scarce. -march is arch-specific, so only pass
  // the x86-64-v2 baseline when actually targeting x86_64.
  const macArch = process.env.MONKE_MAC_ARCH   // 'x86_64' | 'arm64' | undefined (native)
  const archFlag = macArch ? `-arch ${macArch}` : ''
  const targetIsX64 = macArch ? macArch === 'x86_64' : a === 'x64'
  const march = targetIsX64 ? (process.env.MONKE_NATIVE_MARCH ? `-march=${process.env.MONKE_NATIVE_MARCH}` : '-march=x86-64-v2') : ''
  cmd = `clang -O3 -ffast-math ${archFlag} ${march} "${src}" -o "${out}" -lm`
} else {
  // Linux (and other unixes): gcc/clang with OpenMP + portable baseline.
  // Statically link libgomp when its archive is present, so the binary doesn't
  // require libgomp.so.1 to be installed on the target (bare Ubuntu/Debian lack
  // it). Fall back to dynamic -fopenmp if the static archive isn't found.
  const cc = has('gcc') ? 'gcc' : (has('clang') ? 'clang' : 'cc')
  let staticGomp = false
  try {
    // gcc prints an absolute path when the archive exists, else echoes the bare name.
    const path = execSync(`${cc} -print-file-name=libgomp.a`, { shell: true }).toString().trim()
    staticGomp = path.startsWith('/') && existsSync(path)
  } catch {}
  const omp = staticGomp ? '-fopenmp -static-libgcc -l:libgomp.a' : '-fopenmp'
  cmd = `${cc} -O3 ${marchFlag()} ${omp} "${src}" -o "${out}" -lm`
}
console.log('[monke] building runtime:', cmd)
execSync(cmd, { stdio: 'inherit', cwd: dir })
console.log('[monke] built', out)
