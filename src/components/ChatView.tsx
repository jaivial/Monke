import { AssistantRuntimeProvider, ThreadPrimitive, MessagePrimitive, ComposerPrimitive } from '@assistant-ui/react'
import { ArrowUp, Gauge, Info } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { useMonkeChat, type TurnTiming } from '../lib/runtime'
import { MarkdownText } from './MarkdownText'
import monkeFace from '../../assets/monke-face.png'

function UserMessage() {
  return (
    <div className="msg-row fadein">
      <MessagePrimitive.Root><div className="bubble-user selectable"><MessagePrimitive.Content /></div></MessagePrimitive.Root>
    </div>
  )
}
function AssistantMessage() {
  return (
    <div className="msg-row fadein">
      <MessagePrimitive.Root>
        <div className="bubble-assistant selectable">
          {/* Typing indicator while the reply is empty (waiting for first token) */}
          <MessagePrimitive.If hasContent={false}>
            <div className="typing-dots" aria-label="Generating"><span /><span /><span /></div>
          </MessagePrimitive.If>
          <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        </div>
      </MessagePrimitive.Root>
    </div>
  )
}

function Composer({ modelName, timing }: { modelName: string; timing: TurnTiming | null }) {
  return (
    <div className="composer-wrap">
      <div className="flex items-center justify-end mb-1.5 pr-1 h-4">
        {timing != null && (
          <div className="group relative flex items-center gap-1 text-[10.5px] text-haze-300 tabular-nums fadein">
            <Gauge size={11} className="text-haze-400" />
            <span className="font-semibold">{timing.tokS.toFixed(0)}</span>
            <span className="text-haze-400">tok/s</span>
            <Info size={11} className="text-haze-500 ml-0.5 cursor-help" />
            {/* Message-timing popover (our real metrics, shown on hover) */}
            <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-52 opacity-0 group-hover:opacity-100 transition-opacity z-20">
              <div className="panel rounded-lg px-3 py-2.5 text-left shadow-xl">
                <div className="text-[11px] font-semibold text-haze-200 mb-1.5">Message timing</div>
                <TimingRow label="First token" value={`${timing.ttftMs.toFixed(0)} ms`} />
                <TimingRow label="Total" value={`${(timing.totalMs / 1000).toFixed(2)} s`} />
                <TimingRow label="Speed" value={`${timing.tokS.toFixed(1)} tok/s`} />
                <TimingRow label="Chunks" value={`${timing.tokens}`} />
              </div>
            </div>
          </div>
        )}
      </div>
      <ComposerPrimitive.Root className="composer no-drag">
        <ComposerPrimitive.Input autoFocus placeholder="Message MONKE…" rows={1} />
        <ComposerPrimitive.Send className="send-btn" aria-label="Send"><ArrowUp size={17} /></ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
      <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-haze-400 mt-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
        <span className="font-medium text-haze-300">{modelName || 'disk-routed-chat'}</span>
        <span className="text-haze-500">·</span>
        <span>CPU + SSD · no GPU</span>
      </div>
    </div>
  )
}

function TimingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] py-0.5">
      <span className="text-haze-400">{label}</span>
      <span className="tabular-nums text-haze-200">{value}</span>
    </div>
  )
}

export default function ChatView({ chatId, onMetrics }: { chatId: string; onMetrics: (m: { tokS: number }) => void }) {
  const [timing, setTiming] = useState<TurnTiming | null>(null)
  // Surface tok/s to the sidebar (parent) and the full timing locally.
  const handleMetrics = useCallback((m: TurnTiming) => { setTiming(m); onMetrics({ tokS: m.tokS }) }, [onMetrics])
  const { runtime } = useMonkeChat(chatId, handleMetrics)
  const [modelName, setModelName] = useState('')
  useEffect(() => { window.monke.modelName().then(setModelName).catch(() => {}) }, [])
  // Reset the local readout when switching chats.
  useEffect(() => { setTiming(null) }, [chatId])
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="aui-thread-root">
        <ThreadPrimitive.Viewport className="aui-thread-viewport">
          <ThreadPrimitive.Empty>
            <div className="h-full min-h-[46vh] flex flex-col items-center justify-center text-center fadein">
              <img src={monkeFace} alt="MONKE" className="w-24 h-24 mb-4 select-none pointer-events-none" draggable={false} />
              <div className="text-[26px] font-semibold tracking-tight">How can I help?</div>
              <div className="mt-2 text-[13px] text-haze-400">A tiny disk-routed model running entirely on your CPU and SSD.</div>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <Composer modelName={modelName} timing={timing} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
