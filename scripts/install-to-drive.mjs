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
await cp(ROOT, dest, {
  recursive: true,
  filter: (source) => !['.git', 'dist', 'dist-electron', 'release', 'monke.db'].some(x => source === join(ROOT, x) || source.startsWith(join(ROOT, x) + '/')),
})
console.log('Done. Eject drive safely. Start:')
console.log(OS === 'win' ? `  ${join(dest, 'start.bat')}` : `  ${join(dest, OS === 'darwin' ? 'start.command' : 'start.sh')}`)
