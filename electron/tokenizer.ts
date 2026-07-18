// ByteLevel BPE tokenizer for the FineWeb 32k tokenizer.json (GPT-2 style).
import { readFileSync } from 'node:fs'

function bytesToUnicode(): [Record<number, string>, Record<string, number>] {
  const bs: number[] = []
  for (let i = 33; i <= 126; i++) bs.push(i)
  for (let i = 161; i <= 172; i++) bs.push(i)
  for (let i = 174; i <= 255; i++) bs.push(i)
  const cs = bs.slice()
  let n = 0
  for (let b = 0; b < 256; b++) if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++ }
  const b2u: Record<number, string> = {}, u2b: Record<string, number> = {}
  bs.forEach((b, i) => { const ch = String.fromCodePoint(cs[i]); b2u[b] = ch; u2b[ch] = b })
  return [b2u, u2b]
}

const PAT = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu

export class Tokenizer {
  vocab: Record<string, number> = {}
  decoder: Record<number, string> = {}
  ranks: Record<string, number> = {}
  special: Record<string, number> = {}
  b2u: Record<number, string>
  u2b: Record<string, number>
  private cache = new Map<string, string[]>()

  constructor(path: string) {
    const j = JSON.parse(readFileSync(path, 'utf-8'))
    this.vocab = j.model.vocab
    for (const [t, i] of Object.entries(this.vocab)) this.decoder[i as number] = t
    // merges may be space-strings ("a b") or pair-arrays (["a","b"]); normalise to a\0b
    ;(j.model.merges as (string | [string, string])[]).forEach((m, i) => {
      const key = Array.isArray(m) ? m[0] + '\u0000' + m[1] : (m as string).replace(' ', '\u0000')
      this.ranks[key] = i
    })
    for (const a of j.added_tokens || []) { this.special[a.content] = a.id; this.decoder[a.id] = a.content }
    ;[this.b2u, this.u2b] = bytesToUnicode()
  }
  id(tok: string): number { return this.special[tok] ?? this.vocab[tok] ?? this.special['<unk>'] ?? 0 }

  private bpe(token: string): string[] {
    if (this.cache.has(token)) return this.cache.get(token)!
    let word = Array.from(token)
    if (word.length <= 1) { this.cache.set(token, word); return word }
    for (;;) {
      let best = -1, bestRank = Infinity
      for (let i = 0; i < word.length - 1; i++) {
        const r = this.ranks[word[i] + '\u0000' + word[i + 1]]
        if (r !== undefined && r < bestRank) { bestRank = r; best = i }
      }
      if (best < 0) break
      word = [...word.slice(0, best), word[best] + word[best + 1], ...word.slice(best + 2)]
    }
    this.cache.set(token, word)
    return word
  }

  private encodePlain(text: string): number[] {
    const ids: number[] = []
    const matches = text.match(PAT) || []
    for (const piece of matches) {
      const bytes = Buffer.from(piece, 'utf-8')
      let mapped = ''
      for (const b of bytes) mapped += this.b2u[b]
      for (const bt of this.bpe(mapped)) ids.push(this.vocab[bt] ?? this.id('<unk>'))
    }
    return ids
  }

  // Encode text, honoring special tokens present verbatim in the string.
  encode(text: string): number[] {
    const specials = Object.keys(this.special).sort((a, b) => b.length - a.length)
    const ids: number[] = []
    let i = 0
    while (i < text.length) {
      let hit: string | null = null
      for (const s of specials) if (text.startsWith(s, i)) { hit = s; break }
      if (hit) { ids.push(this.special[hit]); i += hit.length }
      else {
        let j = i + 1
        while (j < text.length && !specials.some(s => text.startsWith(s, j))) j++
        ids.push(...this.encodePlain(text.slice(i, j))); i = j
      }
    }
    return ids
  }

  decode(ids: number[], skipSpecial = true): string {
    let out = Buffer.alloc(0)
    const chunks: number[] = []
    for (const id of ids) {
      const tok = this.decoder[id]
      if (tok === undefined) continue
      if (this.special[tok] !== undefined) { if (skipSpecial) continue; else { out = Buffer.concat([out, Buffer.from(tok)]); continue } }
      for (const ch of Array.from(tok)) { const b = this.u2b[ch]; if (b !== undefined) chunks.push(b) }
    }
    return Buffer.concat([out, Buffer.from(Uint8Array.from(chunks))]).toString('utf-8')
  }

  // Build the chat prompt token stream for a single user turn.
  chatPrompt(userText: string): number[] {
    return [this.id('<s>'), this.id('<|user|>'),
      ...this.encodePlain('\n' + userText),
      this.id('</s>'), this.id('<|assistant|>'), ...this.encodePlain('\n')]
  }
}
