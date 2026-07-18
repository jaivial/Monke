#!/usr/bin/env node
// MONKE cross-platform pre-startup: detect the host, ensure every dependency is
// present (install what's missing), build/pick the native runtime, fetch the
// model, then launch the app. Designed to run portably from a flash drive.
//
//   node bootstrap/bootstrap.mjs            # check + install + launch
//   node bootstrap/bootstrap.mjs --check    # check only, no install/launch
//   node bootstrap/bootstrap.mjs --yes      # non-interactive (auto-approve installs)

import { execSync, spawnSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, chmodSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arch as osArch, platform as osPlatform } from 'node:os'
import { createInterface } from 'node:readline'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const CHECK_ONLY = ARGS.includes('--check')
const AUTO_YES = ARGS.includes('--yes') || process.env.MONKE_YES === '1'

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
const ok = (m) => console.log(`${C.g}  OK${C.x}  ${m}`)
const warn = (m) => console.log(`${C.y}  ..${C.x}  ${m}`)
const bad = (m) => console.log(`${C.r} MISS${C.x} ${m}`)
const head = (m) => console.log(`\n${C.b}${m}${C.x}`)

const PLAT = { linux: 'linux', darwin: 'darwin', win32: 'win' }[osPlatform()] || osPlatform()
const ARCH = { x64: 'x64', arm64: 'arm64' }[osArch()] || osArch()
const EXE = PLAT === 'win' ? '.exe' : ''

function have(cmd) { try { execSync(PLAT === 'win' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' }); return true } catch { return false } }
function run(cmd, opts = {}) { return spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT, ...opts }).status === 0 }
async function ask(q) {
  if (AUTO_YES) return true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise((res) => rl.question(`${C.y}?${C.x} ${q} [Y/n] `, res)); rl.close()
  return !/^n/i.test(a.trim())
}

// ---- Linux package-manager abstraction ----
function linuxInstaller() {
  if (have('apt-get')) return { name: 'apt', cmd: 'sudo apt-get update && sudo apt-get install -y build-essential python3 curl' }
  if (have('dnf')) return { name: 'dnf', cmd: 'sudo dnf install -y gcc gcc-c++ make python3 curl' }
  if (have('pacman')) return { name: 'pacman', cmd: 'sudo pacman -S --needed --noconfirm base-devel python curl' }
  if (have('zypper')) return { name: 'zypper', cmd: 'sudo zypper install -y gcc gcc-c++ make python3 curl' }
  if (have('apk')) return { name: 'apk', cmd: 'sudo apk add build-base python3 curl' }
  return null
}

async function ensureCompiler() {
  head('Toolchain (fallback: no matching prebuilt runtime)')
  const cc = have('cc') || have('gcc') || have('clang') || (PLAT === 'win' && (have('cl') || have('gcc')))
  if (cc) { ok('C compiler present'); return true }
  bad('C compiler not found')
  if (CHECK_ONLY) return false
  if (PLAT === 'linux') {
    const inst = linuxInstaller()
    if (inst && await ask(`Install build tools via ${inst.name}?`)) return run(inst.cmd)
  } else if (PLAT === 'darwin') {
    if (await ask('Install Xcode Command Line Tools (clang)?')) { run('xcode-select --install'); warn('finish the CLT installer dialog, then re-run'); return false }
  } else if (PLAT === 'win') {
    if (have('winget') && await ask('Install Visual Studio Build Tools via winget?'))
      return run('winget install -e --id Microsoft.VisualStudio.2022.BuildTools --silent')
    if (have('choco') && await ask('Install VS Build Tools via choco?'))
      return run('choco install -y visualstudio2022buildtools visualstudio2022-workload-vctools')
  }
  warn('Install a C compiler manually, or rely on a prebuilt runtime binary.')
  return false
}

function prebuiltPath() { return join(ROOT, 'native', 'prebuilt', `monke_runtime-${PLAT}-${ARCH}${EXE}`) }
function runtimeExists() { return existsSync(join(ROOT, 'native', 'bin', 'monke_runtime' + EXE)) || existsSync(prebuiltPath()) }
function ensureNativeRuntime(compilerOk) {
  head('Native inference runtime')
  const target = join(ROOT, 'native', 'bin', 'monke_runtime' + EXE)
  if (existsSync(target)) { ok(`runtime ready (${target})`); return true }
  const prebuilt = prebuiltPath()
  if (existsSync(prebuilt)) {
    mkdirSync(join(ROOT, 'native', 'bin'), { recursive: true })
    copyFileSync(prebuilt, target); if (PLAT !== 'win') chmodSync(target, 0o755)
    ok(`using prebuilt ${PLAT}-${ARCH}; compiler not needed`); return true
  }
  bad(`no prebuilt for ${PLAT}-${ARCH}`)
  if (CHECK_ONLY) return false
  if (compilerOk) { warn('compiling from source...'); return run('node native/build.mjs') }
  warn('cannot build (no compiler). Add a prebuilt to native/prebuilt/ or install a compiler.')
  return false
}

function ensureNodeModules() {
  head('JavaScript dependencies')
  if (existsSync(join(ROOT, 'node_modules', 'electron'))) { ok('node_modules present'); return ensureNativeModules() }
  bad('node_modules missing')
  if (CHECK_ONLY) return false
  warn('installing (npm install — may take a few minutes)...')
  return run('npm install') && ensureNativeModules()
}

// better-sqlite3 is a native addon compiled for a specific ABI. If node_modules
// was copied from a machine with a different Node/Electron ABI (e.g. moved on a
// flash drive), the prebuilt won't load. Detect the compiled binary and, if a
// rebuild marker is missing, run electron-rebuild once. Non-fatal on failure.
function ensureNativeModules() {
  const sqliteNode = join(ROOT, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (!existsSync(sqliteNode)) {
    if (CHECK_ONLY) return true
    warn('native better-sqlite3 missing — rebuilding for Electron...')
    run('npm run rebuild')
  }
  return true
}

function ensureModel() {
  head('Model files')
  const dir = process.env.MONKE_MODEL_DIR || join(ROOT, 'model')
  const need = ['controller.bin', 'mem.i8', 'scale.txt', 'tokenizer.json']
  const missing = need.filter(f => !existsSync(join(dir, f)))
  if (missing.length === 0) { ok(`model present (${dir})`); return true }
  bad(`missing: ${missing.join(', ')}`)
  if (CHECK_ONLY) return false
  warn('downloading (~700 MB)...')
  return run('node scripts/fetch-model.mjs')
}

function launch() {
  head('Launch')
  const pkgApp = {
    linux: join(ROOT, 'release'), darwin: join(ROOT, 'release'), win: join(ROOT, 'release'),
  }[PLAT]
  // source mode: run the dev app (works everywhere the deps are present)
  console.log(`${C.d}  starting MONKE...${C.x}`)
  const child = spawn('npm', ['run', 'dev'], { cwd: ROOT, stdio: 'inherit', shell: true })
  child.on('exit', (c) => process.exit(c ?? 0))
}

// ---- Node self-check (we are already running under node) ----
head(`${C.b}MONKE bootstrap${C.x}  ·  host: ${PLAT}-${ARCH}  ·  node ${process.version}`)
const majorNode = +process.version.slice(1).split('.')[0]
if (majorNode >= 18) ok(`Node.js ${process.version}`)
else { bad(`Node.js ${process.version} is too old (need >=18)`); process.exit(1) }

// Prebuilt matching host? No compiler or admin install needed.
const compilerOk = runtimeExists() ? true : await ensureCompiler()
const rtOk = ensureNativeRuntime(compilerOk)
const nmOk = CHECK_ONLY
  ? (existsSync(join(ROOT, 'node_modules', 'electron')) ? (ok('JavaScript dependencies present'), true) : (bad('JavaScript dependencies missing'), false))
  : ensureNodeModules()
const mdOk = ensureModel()

console.log('')
if (CHECK_ONLY) {
  const all = rtOk && nmOk && mdOk
  console.log(all ? `${C.g}All dependencies satisfied.${C.x}` : `${C.y}Some dependencies are missing (run without --check to install).${C.x}`)
  process.exit(all ? 0 : 1)
}
if (rtOk && nmOk && mdOk) launch()
else { console.log(`${C.r}Setup incomplete — resolve the items above and re-run.${C.x}`); process.exit(1) }
