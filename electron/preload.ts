import { contextBridge, ipcRenderer } from 'electron'

export type BootStep = { key: string; ok: boolean; detail?: string }
export type BootResult = { ok: boolean; steps: BootStep[]; model: string }
export type GenMetrics = { tokS: number; ioBytesPerToken: number; rssMb: number }

const api = {
  boot: (): Promise<BootResult> => ipcRenderer.invoke('boot:init'),
  chats: {
    list: () => ipcRenderer.invoke('chats:list'),
    create: () => ipcRenderer.invoke('chats:create'),
    remove: (id: string) => ipcRenderer.invoke('chats:delete', id),
    rename: (id: string, title: string) => ipcRenderer.invoke('chats:rename', id, title),
    messages: (id: string) => ipcRenderer.invoke('chats:messages', id),
  },
  send: (chatId: string, text: string, maxTokens?: number) => ipcRenderer.invoke('chat:send', chatId, text, maxTokens),
  onDelta: (cb: (p: { chatId: string; delta: string }) => void) => {
    const h = (_: any, p: any) => cb(p); ipcRenderer.on('chat:delta', h); return () => ipcRenderer.off('chat:delta', h)
  },
  onDone: (cb: (p: { chatId: string; metrics: GenMetrics }) => void) => {
    const h = (_: any, p: any) => cb(p); ipcRenderer.on('chat:done', h); return () => ipcRenderer.off('chat:done', h)
  },
  stats: () => ipcRenderer.invoke('stats:get'),
  win: { min: () => ipcRenderer.send('win:min'), max: () => ipcRenderer.send('win:max'), close: () => ipcRenderer.send('win:close') },
}
contextBridge.exposeInMainWorld('monke', api)
export type MonkeAPI = typeof api
