import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react'
import { useCallback, useEffect, useState } from 'react'
import type { UiMsg } from '../types'

export type TurnTiming = { tokS: number; ttftMs: number; totalMs: number; tokens: number }

// Bridges assistant-ui to the MONKE local inference backend (window.monke).
export function useMonkeChat(chatId: string | null, onMetrics: (m: TurnTiming) => void) {
  const [messages, setMessages] = useState<UiMsg[]>([])
  const [isRunning, setRunning] = useState(false)

  useEffect(() => {
    if (!chatId) { setMessages([]); return }
    window.monke.chats.messages(chatId).then((rows: any[]) =>
      setMessages(rows.map(r => ({ id: r.id, role: r.role, text: r.content, tokS: r.tok_s }))))
  }, [chatId])

  const onNew = useCallback(async (msg: any) => {
    if (!chatId) return
    const text: string = (msg.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('')
    if (!text.trim()) return
    setMessages(m => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])
    setRunning(true)
    // Timing: wall-clock start, time-to-first-token, and stream chunk count.
    const t0 = performance.now()
    let ttftMs = 0, chunks = 0
    const off = window.monke.onDelta(({ chatId: cid, delta }) => {
      if (cid !== chatId) return
      if (ttftMs === 0) ttftMs = performance.now() - t0
      chunks++
      setMessages(m => { const c = [...m]; const last = c[c.length - 1]; c[c.length - 1] = { ...last, text: last.text + delta }; return c })
    })
    try {
      const res = await window.monke.send(chatId, text)
      const totalMs = performance.now() - t0
      onMetrics({ tokS: res.metrics.tokS, ttftMs, totalMs, tokens: chunks })
      setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: res.text, tokS: res.metrics.tokS }; return c })
    } catch (e: any) {
      setMessages(m => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], text: '[runtime error] ' + (e?.message || e) }; return c })
    } finally { off(); setRunning(false) }
  }, [chatId, onMetrics])

  const convertMessage = (m: UiMsg): ThreadMessageLike => ({ role: m.role, content: [{ type: 'text', text: m.text }] })
  const runtime = useExternalStoreRuntime({ isRunning, messages, convertMessage, onNew })
  return { runtime, messages, isRunning }
}
