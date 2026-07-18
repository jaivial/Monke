#!/usr/bin/env node
// Copy a ready-to-run MONKE bundle to a flash drive.
// Run after `npm install`, model download, and native build on this OS/CPU.
// Usage: node scripts/install-to-drive.mjs /media/MONKE

import { cp, mkdir, rm } from 'node:fs/promises'
import { existsSync as exists, createWriteStream } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { arch, platform } from 'node:os'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DRIVE = process.argv[2] && resolve(process.argv[2])
const NODE_VER = 'v20.18.0'
const OS = { linux: 'linux', darwin: 'darwin', win32: 'win' }[platform()] || platform()
const CPU = { x64: 'x64', arm64: 'arm64' }[arch()] || arch()
const exe = OS === 'win' ? '.exe' : ''

if (!DRIVE) throw new Error('Usage: node scripts/install-to-drive.mjs <flash-drive-path>')
if (DRIVE === ROOT || ROOT.startsWith(DRIVE + '/')) throw new Error('Destination must be a separate flash-drive folder')
const model = ['controller.bin', 'mem.i8', 'scale.txt', 'tokenizer.json']
const missing = model.filter(f => !exists(join(ROOT, 'model', f)))
if (missing.length) throw new Error(`Model missing: ${missing.join(', ')}. Run: node scripts/fetch-model.mjs`)
if (!exists(join(ROOT, 'node_modules', 'electron'))) throw new Error('node_modules missing. Run: npm install')
if (!exists(join(ROOT, 'native', 'bin', `monke_runtime${exe}`))) throw new Error('Native runtime missing. Run: node native/build.mjs')

// Put portable Node on the drive now, so target PC needs neither Node nor internet.
const nodeDir = join(ROOT, '.runtime', `node-${OS}-${CPU}`)
const nodeBin = join(nodeDir, OS === 'win' ? 'node.exe' : 'bin/node')
if (!exists(nodeBin)) {
  const pkg = `node-${NODE_VER}-${OS}-${CPU}`
  const url = `https://nodejs.org/dist/${NODE_VER}/${pkg}.${OS === 'win' ? 'zip' : 'tar.gz'}`
  const cache = join(ROOT, '.runtime', `node.${OS === 'win' ? 'zip' : 'tgz'}`)
  await mkdir(join(ROOT, '.runtime'), { recursive: true })
  console.log(`Downloading portable Node ${OS}-${CPU}...`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Portable Node download failed: HTTP ${res.status}`)
  await pipeline(res.body, createWriteStream(cache))
  const { execFileSync } = await import('node:child_process')
  if (OS === 'win') {
    // PowerShell ships with supported Windows and handles zip extraction.
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Force '${cache}' '${join(ROOT, '.runtime')}'; Rename-Item '${join(ROOT, '.runtime', pkg)}' '${nodeDir}'`], { stdio: 'inherit' })
  } else {
    execFileSync('tar', ['xzf', cache, '-C', join(ROOT, '.runtime')], { stdio: 'inherit' })
    await rm(nodeDir, { recursive: true, force: true })
    const { rename } = await import('node:fs/promises'); await rename(join(ROOT, '.runtime', pkg), nodeDir)
  }
  await rm(cache, { force: true })
}

const dest = join(DRIVE, 'MONKE')
await mkdir(DRIVE, { recursive: true })
console.log(`Installing ${OS}-${CPU} MONKE bundle → ${dest}`)
await rm(dest, { recursive: true, force: true })

// dereference:true turns symlinks into real files. Flash drives are commonly
// exFAT/FAT32 (the only formats natively read-write on Win+mac+Linux), and those
// filesystems CANNOT store symlinks — copying them as links fails with EPERM.
// Dereferencing is safe on every filesystem, so we always do it.
const EXCLUDE = ['.git', 'dist', 'dist-electron', 'release', 'monke.db', '.vite']
await cp(ROOT, dest, {
  recursive: true,
  dereference: true,
  filter: (source) => !EXCLUDE.some(x => source === join(ROOT, x) || source.startsWith(join(ROOT, x) + '/')),
})

// node_modules/.bin/* are normally symlinks (e.g. .bin/vite -> ../vite/bin/vite.js).
// Dereferencing above turned each into a *copy* of the target script, which then
// resolves its own sibling files relative to .bin/ and breaks ("Cannot find
// module .../dist/node/cli.js"). Regenerate every shim as a tiny wrapper that
// execs the real target, so the bundle runs from an exFAT drive.
async function fixBinShims(srcRoot, dstRoot) {
  const { readdir, lstat, readlink, writeFile, chmod } = await import('node:fs/promises')
  let fixed = 0
  async function walk(rel) {
    let entries
    try { entries = await readdir(join(srcRoot, rel), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const r = join(rel, e.name)
      if (e.name === '.bin') {
        for (const f of await readdir(join(srcRoot, r))) {
          const s = join(srcRoot, r, f)
          let st; try { st = await lstat(s) } catch { continue }
          if (!st.isSymbolicLink()) continue          // .cmd/.ps1 real files: leave as-is
          const target = await readlink(s)             // relative, e.g. ../vite/bin/vite.js
          const wrapper =
`#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const target = resolve(__dirname, ${JSON.stringify(target)})
const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status == null ? 1 : r.status)
`
          const d = join(dstRoot, r, f)
          await writeFile(d, wrapper); await chmod(d, 0o755); fixed++
        }
      } else if (e.isDirectory()) {
        await walk(r)                                  // recurse into nested node_modules
      }
    }
  }
  await walk('node_modules')
  return fixed
}
const shims = await fixBinShims(ROOT, dest)
if (shims) console.log(`Rewrote ${shims} node_modules/.bin shims for symlink-less filesystems`)

// Sanity check: warn if the copy dropped files (e.g. drive full mid-copy).
const countFiles = async (root) => {
  const { readdir } = await import('node:fs/promises')
  let n = 0
  const walk = async (d) => {
    let es; try { es = await readdir(d, { withFileTypes: true }) } catch { return }
    for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) await walk(p); else n++ }
  }
  await walk(join(root, 'node_modules'))
  return n
}
const srcN = await countFiles(ROOT), dstN = await countFiles(dest)
if (dstN < srcN) console.warn(`WARNING: node_modules copied ${dstN}/${srcN} files — drive may be full or copy interrupted.`)
else console.log(`node_modules: ${dstN} files copied`)

console.log('Done. Eject drive safely. Start:')
console.log(OS === 'win' ? `  ${join(dest, 'start.bat')}` : `  ${join(dest, OS === 'darwin' ? 'start.command' : 'start.sh')}`)
