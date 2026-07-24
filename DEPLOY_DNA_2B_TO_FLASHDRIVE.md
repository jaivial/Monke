# Deploying DNA-DiskChat-2B to an existing MONKE flash drive

This guide adds the **DNA-DiskChat-2B** model as a second, higher-capacity engine on
a flash drive that already runs **MONKE + the 0.5B-v2** model. It reuses MONKE's exact
CPU + SSD, **O_DIRECT** streaming design - no GPU, controller in RAM, memory table on
disk read 2 rows/token.

Measured (Linux, 8 threads, table on SSD): **~86 tok/s, ~310 MB RSS, O_DIRECT**,
bit-exact with the PyTorch reference.

---

## 0. How DNA-2B differs from the 0.5B already on the drive

| | 0.5B-v2 (existing) | DNA-DiskChat-2B (new) |
|---|---|---|
| Runtime | `native/monke_runtime.c` | `native/monke_runtime_dna.c` |
| Controller header | `DCR2` | `DNA1` |
| On-disk table | `mem.i8` int8 rows (512 B/row) | `codons.u8` codon rows (**128 B/row**) |
| Table read | 2 rows -> dequant `* scale` | 2 rows -> **codebook DECODE** + expand/contract |
| Per-token disk I/O | 8 KiB (2x4 KiB pages) | 8 KiB physical / **256 B useful** |
| Params | ~0.5B (77M active) | **2.24B** (96.8M active controller) |
| Extra weights | - | `expand`, `contract`, positional `codebook` |

Everything else - the gated recurrent backbone, product-key top-2 routing, the
stdin/stdout protocol - is identical, so the Electron engine drives both the same way.

---

## 1. Get the model artifacts

You need three files. Either **download** them from the Hugging Face repo or **export**
them from a checkpoint.

### Option A - download (recommended)
From `https://huggingface.co/jaivial/dna-diskchat-2b-v1`:
- `ctrl_dna.bin`  (~321 MB, fp32 controller)      -> rename to `controller.bin`
- `codons.u8`     (~512 MB, codon memory table)
- `tokenizer.json` (32k ByteLevel-BPE)

### Option B - export from a checkpoint (`scripts/export_c_dna.py` in the HF repo)
```bash
# on a machine with the checkpoint + torch:
DNA_CK=/path/to/base.pt python export_c_dna.py "The capital of France is"
#   writes ctrl_dna.bin (=controller.bin) and codons.u8 to /root/dna
```
`export_c_dna.py` also prints a PyTorch reference completion so you can verify the C
runtime is bit-exact.

> The **SFT (chat) model** is `sft/sft.pt` in the same repo. Re-run `export_c_dna.py`
> with `DNA_CK=.../sft.pt` to get a chat-tuned `controller.bin` instead of the base LM.

---

## 2. Lay the files out on the drive

Keep the existing 0.5B `model/` untouched and add a sibling folder:

```
<DRIVE>/
  model/                 # existing 0.5B-v2 (leave as-is)
  model-dna2b/           # NEW
    controller.bin       # = ctrl_dna.bin
    codons.u8
    tokenizer.json
  native/
    monke_runtime.c
    monke_runtime_dna.c  # NEW (from this repo, native/)
    build.mjs
    bin/                 # built binaries land here
```

USB 3.0+ strongly recommended: the 512 MB codon table streams from the drive.

---

## 3. Build the DNA runtime (per OS)

`monke_runtime_dna.c` uses the same unbuffered-I/O pattern as `monke_runtime.c`
(`O_DIRECT` on Linux, `F_NOCACHE` on macOS, `FILE_FLAG_NO_BUFFERING` on Windows).

```bash
# Linux
gcc -O3 -march=native -fopenmp native/monke_runtime_dna.c -o native/bin/monke_runtime_dna -lm
# macOS (Apple clang, single-thread; still fast for one stream)
clang -O3 -ffast-math native/monke_runtime_dna.c -o native/bin/monke_runtime_dna -lm
# Windows (MSVC)
cl /O2 /openmp /Fe:native\bin\monke_runtime_dna.exe native\monke_runtime_dna.c psapi.lib
# Windows (MinGW)  gcc -O3 -fopenmp native\monke_runtime_dna.c -o native\bin\monke_runtime_dna.exe -lm -lpsapi
```

Or add a DNA target to `native/build.mjs` (mirror the existing block, swap the source
file and output name) so `node native/build.mjs` builds both runtimes.

---

## 4. Wire it into MONKE (Electron)

The engine in `electron/inference.ts` spawns the runtime and speaks the protocol
`READY / RESET / PROMPT / GEN / PING`. `monke_runtime_dna` implements the **same**
protocol, so only three small things change: the file check, the binary, and the
table filename (there is no `scale.txt`).

Minimal changes:

```ts
// electron/inference.ts
static filesPresent(model: string) {
  // DNA model: controller.bin + codons.u8 + tokenizer.json
  if (existsSync(`${model}/codons.u8`))
    return ['controller.bin', 'codons.u8', 'tokenizer.json'].every(f => existsSync(`${model}/${f}`))
  // 0.5B model: controller.bin + mem.i8 + scale.txt + tokenizer.json
  return ['controller.bin', 'mem.i8', 'scale.txt', 'tokenizer.json'].every(f => existsSync(`${model}/${f}`))
}

async start(): Promise<void> {
  const dna = existsSync(`${this.modelDir}/codons.u8`)
  const bin = dna ? this.binDnaPath : this.binPath           // native/bin/monke_runtime_dna
  const table = dna ? `${this.modelDir}/codons.u8` : this.mem
  // monke_runtime_dna args: controller codons [scale-ignored] [threads]
  this.proc = spawn(bin, [this.controller, table, this.scale ?? '1', String(this.threads)],
                    { stdio: ['pipe', 'pipe', 'pipe'] })
  /* ...unchanged READY/line handling... */
}
```

Point the model picker at `model-dna2b/` (add it to whatever model list the app uses,
or set an env/setting `MONKE_MODEL_DIR=<DRIVE>/model-dna2b`). The tokenizer path is
`model-dna2b/tokenizer.json`. Nothing else in the engine, DB, or UI needs to change -
the recurrent state, PROMPT/GEN flow, and the `E <tok_s> <io> <rss>` stats line are
identical.

---

## 5. Verify (standalone, before wiring the UI)

Drive the runtime directly with the protocol:

```bash
# READY -> PROMPT <ids> -> OK <last> -> GEN <max> <last> -> T.../E
printf 'PROMPT 1 459 3411 284 3771 316\nGEN 24 316\n' | \
  ./native/bin/monke_runtime_dna model-dna2b/controller.bin model-dna2b/codons.u8 1 8
```
Expect a stream of `T <id>` lines then `E <tok_s> <io_bytes> <rss_mb>`, e.g.
`E 86.29 8192 309.8`. Decoding the ids gives *"...the French capital, Paris. It is the
capital of France..."*.

A pure-batch CLI variant (no protocol) is also available as `scripts/direct_dna.c`:
```bash
gcc -O3 -march=native -fopenmp direct_dna.c -o direct_dna -lm
./direct_dna controller.bin codons.u8 prompt.u16 64 out_ids.txt
```

---

## 6. Notes / limits

- **Base vs chat:** the base `controller.bin` continues text; use the SFT export for an
  instruction-following chat model (weaker on content - 97M active-parameter ceiling).
- **Greedy loops:** greedy decode repeats; add temperature + a repetition penalty in the
  engine's sampler for chat (the 0.5B path already does this).
- **Sizes:** ~321 MB controller (RAM) + 512 MB codon table (SSD). Peak RSS ~310 MB;
  the table stays on disk via O_DIRECT.
- **Portability:** the Linux `O_DIRECT` page read requires 4 KiB-aligned offsets; codon
  rows are 128 B and never straddle a page, so a single 4 KiB read per row is always
  valid (same trick as the 0.5B runtime).
- **Rebuild binaries** for each target OS/arch you ship, exactly like the 0.5B runtime.
