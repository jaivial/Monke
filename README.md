# MONKE

**M**ultiplier of **O**perations **N**on **K**ernel and **E**ffective.

A cross-platform (Linux · macOS · Windows) desktop chat app for the **disk-routed
0.5B** language model. It runs inference **on your CPU and SSD only — no GPU
required** — and is designed to run **portably from a flash drive**. Clean,
minimal, Apple-inspired dark UI. Chat components by
[assistant-ui](https://github.com/assistant-ui/assistant-ui).

- **Model capacity lives on disk** (int8 product-key table), read **2 rows/token**
  (~8 KiB) via unbuffered I/O (`O_DIRECT` / `F_NOCACHE` / `FILE_FLAG_NO_BUFFERING`).
- **~180 tok/s on a fast CPU, ~300 MB host RAM**, controller resident in RAM.
- Live **GPU / host-RAM / throughput** readout, SQLite chat history + per-chat context.
- Loading screen with a dancing-monkey animation and a boot **middleware** that
  loads model + runtime + database + engine before the UI renders.

---

## Stack
- **Electron** (Chromium) + **React** + **TypeScript** + **Vite** + **Tailwind**
- **assistant-ui** chat primitives · **lucide-react** icons
- **better-sqlite3** history · native **C** inference runtime (streaming stdin/stdout)

## Layout
```
electron/     main process: window, IPC, SQLite (db.ts), tokenizer.ts,
              inference.ts (drives the native runtime), stats.ts, preload.ts
native/       monke_runtime.c (cross-platform O_DIRECT inference) + build.mjs
src/          React UI: LoadingScreen, Sidebar, TitleBar, ChatView (assistant-ui),
              StatsPanel, hooks, lib/runtime.ts (assistant-ui <-> backend bridge)
model/        controller.bin, mem.i8, scale.txt, tokenizer.json  (fetched)
assets/       loading-monkey.mp4
```

## Setup
```bash
npm install
node scripts/fetch-model.mjs     # downloads model files into ./model (~700 MB)
node native/build.mjs            # compiles the native runtime for your OS
npm run dev                      # dev (Vite + Electron)
```
Build installers (per-OS):
```bash
npm run build                    # electron-builder for the current OS
npm run dist                     # -mwl (mac/win/linux) where toolchains exist
```

## Run from a flash drive
1. Format the drive **ext4** (Linux/macOS) so `O_DIRECT` works; on Windows/exFAT
   the runtime falls back to buffered reads (still from the drive).
2. Put the packaged app + a `model/` folder (controller.bin, mem.i8, scale.txt,
   tokenizer.json) on the drive.
3. Point the app at the drive's model:
   ```bash
   MONKE_MODEL_DIR=/media/USB/model  ./MONKE           # Linux
   ```
   (or set it in the app's environment). `MONKE_DATA_DIR` controls where the
   SQLite history is stored — default is alongside the model, so **history travels
   with the drive**.
4. Plug in → launch → the monkey loads everything → chat.

**Speed depends on the drive** (workload is latency-bound, ~1,400 random 4 KiB
reads/s): USB4/Thunderbolt NVMe ≈ 150–180 tok/s; commodity thumb drive is usable
but slower.

## How inference works
The native runtime is a persistent process speaking a tiny line protocol:
```
READY <V D L ff a b>              # on start
RESET                 -> OK        # new chat: clear recurrent state
PROMPT <ids...>       -> OK <last> # feed tokens (updates constant-size state)
GEN <max> <last>      -> T <id>... # stream generated tokens, then
                         E <tok_s> <io_bytes/token> <rss_mb>
```
`electron/inference.ts` tokenizes (ByteLevel BPE, `tokenizer.ts`), maintains
per-chat context, and streams decoded deltas to the assistant-ui thread.

## Notes
- macOS Apple-clang builds single-threaded (no OpenMP); still fast for one stream.
- The model is an **experimental minimal-chat** model — coherent and fast, not a
  frontier assistant. See https://huggingface.co/jaivial/disk-routed-chat-0.5b-v2
- License: Apache-2.0.
