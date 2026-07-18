import { Cpu, MemoryStick, Gauge, HardDrive } from 'lucide-react'
import { useStats } from '../hooks/useStats'

function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-ink-600 overflow-hidden">
      <div className="h-full rounded-full bg-haze-200/80 transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export default function StatsPanel({ tokS }: { tokS: number | null }) {
  const s = useStats()
  const gpu = s?.gpu
  return (
    <div className="panel rounded-xl2 px-3.5 py-3 w-[230px] text-[12px] fadein">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-haze-300"><Gauge size={13} /> Throughput</div>
        <div className="font-semibold tabular-nums">{tokS ? `${tokS.toFixed(0)} tok/s` : '—'}</div>
      </div>
      <div className="my-2.5 h-px hairline border-t" />
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-haze-300"><MemoryStick size={13} /> Host RAM</div>
        <div className="tabular-nums text-haze-200">{s ? `${(s.ramUsedMb/1024).toFixed(1)} / ${(s.ramTotalMb/1024).toFixed(0)} GB` : '—'}</div>
      </div>
      <Meter pct={s?.ramPct ?? 0} />
      <div className="mt-2.5 flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-haze-300"><Cpu size={13} /> GPU</div>
        <div className="tabular-nums text-haze-200">{gpu?.present ? `${gpu.utilPct}%` : 'none'}</div>
      </div>
      <Meter pct={gpu?.present ? gpu.utilPct : 0} />
      <div className="mt-2 flex items-center justify-between text-[11px] text-haze-400">
        <div className="flex items-center gap-1.5"><HardDrive size={12} /> table on SSD</div>
        <div className="tabular-nums">2 rows/token · 8 KiB</div>
      </div>
    </div>
  )
}
