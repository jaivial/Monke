import { PanelLeftClose, SquarePen, MessageSquare, Trash2 } from 'lucide-react'
import type { Chat } from '../types'
import StatsPanel from './StatsPanel'

export default function Sidebar({
  chats, activeId, onSelect, onNew, onDelete, onCollapse, tokS,
}: {
  chats: Chat[]; activeId: string | null
  onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; onCollapse: () => void
  tokS: number | null
}) {
  return (
    <div className="panel h-full w-[248px] flex flex-col border-r hairline">
      <div className="drag h-12 flex items-center justify-between pl-3 pr-2">
        <div className="no-drag flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight">MONKE</span>
        </div>
        <button className="no-drag icon-btn" title="Collapse sidebar" onClick={onCollapse}><PanelLeftClose size={17} /></button>
      </div>

      <div className="px-2.5">
        <button onClick={onNew}
          className="no-drag w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] text-haze-200 bg-ink-700/60 hover:bg-ink-600 transition">
          <SquarePen size={15} /> New chat
        </button>
      </div>

      <div className="mt-3 px-2 text-[11px] uppercase tracking-wider text-haze-400">Chats</div>
      <div className="flex-1 overflow-y-auto px-1.5 pt-1 pb-3 space-y-0.5">
        {chats.length === 0 && <div className="px-3 py-2 text-[12px] text-haze-400">No chats yet</div>}
        {chats.map(c => (
          <div key={c.id}
            className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition
              ${activeId === c.id ? 'bg-ink-600/80' : 'hover:bg-ink-700/50'}`}
            onClick={() => onSelect(c.id)}>
            <MessageSquare size={14} className="text-haze-400 shrink-0" />
            <span className="flex-1 truncate text-[13px] text-haze-200">{c.title || 'New chat'}</span>
            <button className="opacity-0 group-hover:opacity-100 icon-btn !w-6 !h-6"
              title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(c.id) }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="border-t hairline">
        <StatsPanel tokS={tokS} />
      </div>
    </div>
  )
}
