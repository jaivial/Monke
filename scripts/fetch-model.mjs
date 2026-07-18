// Download the disk-routed model files into ./model (or $MONKE_MODEL_DIR).
// Usage: node scripts/fetch-model.mjs
import { createWriteStream, mkdirSync, existsSync, statSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'

const BASE = 'https://huggingface.co/jaivial/disk-routed-chat-0.5b-v2/resolve/main'
const DIR = process.env.MONKE_MODEL_DIR || new URL('../model', import.meta.url).pathname
mkdirSync(DIR, { recursive: true })
const files = [
  ['runtime/controller.bin', 'controller.bin'],
  ['runtime/mem.i8', 'mem.i8'],
  ['runtime/scale.txt', 'scale.txt'],
  ['fineweb-tokenizer.json', 'tokenizer.json'],
]
for (const [remote, local] of files) {
  const dest = `${DIR}/${local}`
  if (existsSync(dest) && statSync(dest).size > 0) { console.log('· have', local); continue }
  process.stdout.write(`↓ ${local} ... `)
  const res = await fetch(`${BASE}/${remote}`)
  if (!res.ok) { console.error('FAILED', res.status); process.exit(1) }
  await pipeline(res.body, createWriteStream(dest))
  console.log('done')
}
console.log('model ready in', DIR)
