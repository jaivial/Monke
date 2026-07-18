import { PanelLeftOpen, SquarePen, Minus, Square, X } from 'lucide-react'

export default function TitleBar({
  collapsed, onExpand, onNew, title,
}: { collapsed: boolean; onExpand: () => void; onNew: () => void; title: string }) {
  return (
    <div className="drag h-12 flex items-center justify-between px-2.5 shrink-0">
      <div className="no-drag flex items-center gap-1.5" style={{ paddingLeft: collapsed ? 70 : 0 }}>
        {collapsed && (
          <>
            <button className="icon-btn" title="Open sidebar" onClick={onExpand}><PanelLeftOpen size={17} /></button>
            <button className="icon-btn" title="New chat" onClick={onNew}><SquarePen size={16} /></button>
          </>
        )}
      </div>
      <div className="drag flex-1 text-center text-[12.5px] text-haze-300 truncate px-4">{title}</div>
      <div className="no-drag flex items-center gap-0.5">
        <button className="icon-btn" onClick={() => window.monke.win.min()}><Minus size={15} /></button>
        <button className="icon-btn" onClick={() => window.monke.win.max()}><Square size={12} /></button>
        <button className="icon-btn hover:!bg-rose-500/80 hover:!text-white" onClick={() => window.monke.win.close()}><X size={15} /></button>
      </div>
    </div>
  )
}
