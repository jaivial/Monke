import { Cpu, MemoryStick, Gauge } from 'lucide-react'
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
  // MONKE runs inference on CPU only, so the model uses 0 GPU memory. We report
  // what the MODEL consumes (its process RSS) out of total host RAM, not raw
  // system usage.
  const modelGb = s ? (s.procRssMb / 1024).toFixed(2) : '—'
  const totalGb = s ? (s.ramTotalMb / 1024).toFixed(0) : '—'
  return (
    <div className="px-3 py-3 text-[12px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-haze-300"><Gauge size={13} /> Throughput</div>
        <div className="font-semibold tabular-nums">{tokS ? `${tokS.toFixed(0)} tok/s` : '—'}</div>
      </div>
      <div className="my-2.5 h-px hairline border-t" />
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-haze-300"><MemoryStick size={13} /> Model RAM</div>
        <div className="tabular-nums text-haze-200">{s ? `${modelGb} / ${totalGb} GB` : '—'}</div>
      </div>
      <Meter pct={s?.procRamPct ?? 0} />
      <div className="mt-2.5 flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-haze-300"><Cpu size={13} /> Model GPU</div>
        <div className="tabular-nums text-haze-200">{gpu?.present ? '0 MB (CPU-only)' : 'none'}</div>
      </div>
      <Meter pct={0} />
    </div>
  )
}
