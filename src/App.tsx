import { useEffect, useState, useCallback } from 'react'
import LoadingScreen from './components/LoadingScreen'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import ChatView from './components/ChatView'
import { useChats } from './hooks/useChats'

export default function App() {
  const [loaded, setLoaded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [tokS, setTokS] = useState<number | null>(null)
  const { chats, activeId, setActiveId, newChat, remove, refresh } = useChats()

  // ensure an active chat once loaded
  useEffect(() => {
    if (!loaded) return
    if (!activeId) {
      if (chats.length) setActiveId(chats[0].id)
      else newChat()
    }
  }, [loaded, chats, activeId, setActiveId, newChat])

  const onMetrics = useCallback((m: { tokS: number }) => setTokS(m.tokS), [])
  const title = chats.find(c => c.id === activeId)?.title || 'New chat'

  if (!loaded) return <LoadingScreen onReady={() => setLoaded(true)} />

  return (
    <div className="h-full w-full flex bg-ink-900">
      {!collapsed && (
        <Sidebar
          chats={chats} activeId={activeId}
          onSelect={setActiveId}
          onNew={async () => { const c = await newChat(); await refresh(); setActiveId(c.id) }}
          onDelete={remove}
          onCollapse={() => setCollapsed(true)}
          tokS={tokS}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <TitleBar
          collapsed={collapsed}
          onExpand={() => setCollapsed(false)}
          onNew={async () => { const c = await newChat(); setActiveId(c.id) }}
          title={title}
        />
        <div className="flex-1 relative min-h-0">
          {activeId ? <ChatView key={activeId} chatId={activeId} onMetrics={onMetrics} /> : null}
        </div>
      </div>
    </div>
  )
}
