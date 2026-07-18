// Inference engine: drives the native runtime, manages per-chat recurrent state.
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, Interface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'
import { Tokenizer } from './tokenizer.js'

export type GenMetrics = { tokS: number; ioBytesPerToken: number; rssMb: number }

export class Engine {
  private proc!: ChildProcessWithoutNullStreams
  private rl!: Interface
  private tok: Tokenizer
  private currentChat: string | null = null
  private busy = false
  ready = false
  config: { V: number; D: number; L: number; ff: number; a: number; b: number } | null = null

  // line-response plumbing
  private onLine: ((line: string) => void) | null = null

  constructor(
    private binPath: string,
    private controller: string,
    private mem: string,
    tokenizerPath: string,
    private scale: string,
    private threads: number,
  ) { this.tok = new Tokenizer(tokenizerPath) }

  static filesPresent(model: string) {
    return ['controller.bin', 'mem.i8', 'scale.txt', 'tokenizer.json'].every(f => existsSync(`${model}/${f}`))
  }

  async start(): Promise<void> {
    this.proc = spawn(this.binPath, [this.controller, this.mem, this.scale, String(this.threads)], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stderrTail = ''
    this.proc.stderr.on('data', d => { const s = d.toString(); stderrTail = (stderrTail + s).slice(-400); console.error('[runtime]', s.trim()) })
    this.rl = createInterface({ input: this.proc.stdout })
    this.rl.on('line', l => this.onLine?.(l))
    // The runtime reads the ~300 MB controller into RAM at startup. On a slow
    // flash drive that can take much longer than a fast SSD, so the timeout is
    // generous and overridable (MONKE_ENGINE_TIMEOUT_MS). We also fail fast if
    // the process itself exits, instead of waiting out the whole timeout.
    const timeoutMs = Number(process.env.MONKE_ENGINE_TIMEOUT_MS) || 180000
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error(`runtime start timeout after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs)
      const onExit = (code: number | null) => { clearTimeout(to); reject(new Error(`runtime exited (code ${code}) before ready: ${stderrTail.trim() || 'no output'}`)) }
      this.proc.once('exit', onExit)
      this.onLine = (l) => {
        if (l.startsWith('READY')) {
          const [, V, D, L, ff, a, b] = l.split(/\s+/).map(Number)
          this.config = { V, D, L, ff, a, b }; this.ready = true
          clearTimeout(to); this.proc.off('exit', onExit); this.onLine = null; resolve()
        }
      }
    })
  }

  private send(cmd: string) { this.proc.stdin.write(cmd + '\n') }

  // send a command and collect lines until a terminator predicate matches
  private collect(cmd: string, done: (l: string) => boolean, onToken?: (l: string) => void): Promise<string> {
    return new Promise((resolve) => {
      let term = ''
      this.onLine = (l) => { if (done(l)) { term = l; this.onLine = null; resolve(term) } else onToken?.(l) }
      this.send(cmd)
    })
  }

  private async prime(chatId: string, contextTokens: number[]) {
    await this.collect('RESET', l => l.startsWith('OK') || l.startsWith('PONG'))
    if (contextTokens.length) {
      // feed in chunks to avoid overlong lines
      for (let i = 0; i < contextTokens.length; i += 512) {
        const chunk = contextTokens.slice(i, i + 512)
        await this.collect('PROMPT ' + chunk.join(' '), l => l.startsWith('OK'))
      }
    }
    this.currentChat = chatId
  }

  encodeUserTurn(text: string) { return this.tok.chatPrompt(text) }

  // Generate an assistant reply, streaming decoded text deltas.
  async generate(
    chatId: string, userText: string, contextTokens: number[], maxTokens: number,
    onDelta: (text: string) => void,
  ): Promise<{ text: string; promptTokens: number[]; genTokens: number[]; metrics: GenMetrics }> {
    if (this.busy) throw new Error('engine busy')
    this.busy = true
    try {
      if (this.currentChat !== chatId) await this.prime(chatId, contextTokens)
      const promptTokens = this.tok.chatPrompt(userText)
      const okLine = await this.collect('PROMPT ' + promptTokens.join(' '), l => l.startsWith('OK'))
      const start = Number(okLine.split(/\s+/)[1])

      const genTokens: number[] = []
      let prev = ''
      const eLine = await this.collect(`GEN ${maxTokens} ${start}`,
        l => l.startsWith('E '),
        (l) => {
          if (l.startsWith('T ')) {
            genTokens.push(Number(l.slice(2)))
            const full = this.tok.decode(genTokens)
            if (full.length > prev.length) { onDelta(full.slice(prev.length)); prev = full }
          }
        })
      const [, tokS, io, rss] = eLine.split(/\s+/).map(Number)
      const text = this.tok.decode(genTokens)
      return { text, promptTokens, genTokens, metrics: { tokS: tokS || 0, ioBytesPerToken: io || 0, rssMb: rss || 0 } }
    } finally { this.busy = false }
  }

  procRssMb(): number { return (this.proc as any)?.pid ? 0 : 0 } // rss comes from the E line; stats reads OS
  stop() { try { this.proc.stdin.end(); this.proc.kill() } catch {} }
}
