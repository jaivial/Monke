import { AssistantRuntimeProvider, ThreadPrimitive, MessagePrimitive, ComposerPrimitive } from '@assistant-ui/react'
import { ArrowUp, Gauge } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { useMonkeChat } from '../lib/runtime'
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
      <MessagePrimitive.Root><div className="bubble-assistant selectable"><MessagePrimitive.Content /></div></MessagePrimitive.Root>
    </div>
  )
}

function Composer({ modelName, tokS }: { modelName: string; tokS: number | null }) {
  return (
    <div className="composer-wrap">
      <div className="flex items-center justify-end mb-1.5 pr-1 h-4">
        {tokS != null && (
          <div className="flex items-center gap-1 text-[10.5px] text-haze-300 tabular-nums fadein">
            <Gauge size={11} className="text-haze-400" />
            <span className="font-semibold">{tokS.toFixed(0)}</span>
            <span className="text-haze-400">tok/s</span>
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
        <span>CPU + SSD · 2 rows/token · no GPU</span>
      </div>
    </div>
  )
}

export default function ChatView({ chatId, onMetrics }: { chatId: string; onMetrics: (m: { tokS: number }) => void }) {
  const [tokS, setTokS] = useState<number | null>(null)
  // Surface tok/s both to the sidebar (parent) and locally to the composer.
  const handleMetrics = useCallback((m: { tokS: number }) => { setTokS(m.tokS); onMetrics(m) }, [onMetrics])
  const { runtime } = useMonkeChat(chatId, handleMetrics)
  const [modelName, setModelName] = useState('')
  useEffect(() => { window.monke.modelName().then(setModelName).catch(() => {}) }, [])
  // Reset the local readout when switching chats.
  useEffect(() => { setTokS(null) }, [chatId])
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
        <Composer modelName={modelName} tokS={tokS} />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
