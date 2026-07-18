import { useCallback, useEffect, useState } from 'react'
import type { Chat } from '../types'

export function useChats() {
  const [chats, setChats] = useState<Chat[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const refresh = useCallback(async () => { const c = await window.monke.chats.list(); setChats(c) }, [])
  useEffect(() => { refresh() }, [refresh])
  const newChat = useCallback(async () => { const c = await window.monke.chats.create(); await refresh(); setActiveId(c.id); return c }, [refresh])
  const remove = useCallback(async (id: string) => { await window.monke.chats.remove(id); if (activeId === id) setActiveId(null); await refresh() }, [activeId, refresh])
  return { chats, activeId, setActiveId, newChat, remove, refresh }
}
