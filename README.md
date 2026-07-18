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
native/       monke_runtime.c + build.mjs + platform prebuilt binaries
bootstrap/    host dependency checker/installer and cross-platform startup
start.sh      Linux/macOS portable entry point
start.command macOS Finder double-click entry point
start.bat     Windows portable entry point
src/          React UI: LoadingScreen, Sidebar, TitleBar, ChatView (assistant-ui),
              StatsPanel, hooks, lib/runtime.ts (assistant-ui <-> backend bridge)
model/        controller.bin, mem.i8, scale.txt, tokenizer.json  (fetched)
assets/       loading-monkey.mp4
```

## Portable flash-drive startup — recommended

Copy this repo to drive. Start one file:

| Host | Start |
|---|---|
| Linux | `./start.sh` |
| macOS | double-click `start.command` (or run `./start.sh`) |
| Windows | double-click `start.bat` |

The launcher detects **OS + CPU architecture**. It then:
1. Uses installed Node.js, or downloads portable Node into `.runtime/` on drive.
2. Selects `native/prebuilt/monke_runtime-<os>-<arch>`; **no compiler needed** when shipped binary matches host.
3. Runs `npm install` only when `node_modules/` is missing.
4. Downloads missing model files (~700 MB) from Hugging Face.
5. Starts MONKE.

First run needs internet. Later starts run offline from drive. Nothing installs globally.

Check host readiness without changing anything:
```bash
./start.sh --check                 # Linux/macOS
start.bat --check                  # Windows
# or: npm run check
```

If a host lacks a matching prebuilt runtime, bootstrap asks before installing a C toolchain:
`apt`/`dnf`/`pacman`/`zypper`/`apk` on Linux, Xcode CLT on macOS, `winget`/`choco` Visual Studio Build Tools on Windows. Pass `--yes` only for unattended setup.

## Manual setup
```bash
npm install
node scripts/fetch-model.mjs     # downloads model files into ./model (~700 MB)
node native/build.mjs            # only needed without matching prebuilt runtime
npm run dev                      # dev (Vite + Electron)
```
Build installers (per-OS):
```bash
npm run build                    # electron-builder for the current OS
npm run dist                     # -mwl (mac/win/linux) where toolchains exist
```

## Run from a flash drive
1. Use fastest external SSD available. Linux ext4 allows `O_DIRECT`; macOS and
   Windows use their native no-cache APIs. exFAT/FAT32 can fall back to buffered reads.
2. **Prepare on your desktop once, then install the finished bundle onto drive.**
   On desktop (with internet), run:
   ```bash
   git clone https://github.com/jaivial/Monke.git
   cd Monke
   npm install
   node scripts/fetch-model.mjs
   node native/build.mjs
   npm run install:drive -- /media/MONKE       # Linux/macOS example
   npm run install:drive -- E:\                # Windows example
   ```
   Installer copies source, `node_modules`, model (~700 MB), native runtime, and
   portable Node onto `<drive>/MONKE`. Target PC needs **no Node install, no npm
   install, no compiler, and no internet** when it has same OS + CPU architecture
   as desktop. Re-run installer to refresh drive after updates.
3. Plug drive into target PC. Start `<drive>/MONKE/start.sh`, `start.command`, or
   `start.bat`. The pre-start check verifies every file before MONKE opens.
4. Different OS/architecture? Run its launcher while internet is available once.
   It auto-selects/builds that host's runtime and installs that host's npm modules.
5. Keep `model/` beside app. Or set `MONKE_MODEL_DIR` to another model location:
   ```bash
   MONKE_MODEL_DIR=/media/USB/model ./start.sh          # Linux
   $env:MONKE_MODEL_DIR='E:\Monke\model'; .\start.bat  # Windows PowerShell
   ```
6. `MONKE_DATA_DIR` controls SQLite history. Default is model folder, so history
   travels with drive.

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
