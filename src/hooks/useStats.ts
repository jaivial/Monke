import { useEffect, useState } from 'react'
import type { Stats } from '../types'

export function useStats(intervalMs = 1500) {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    let alive = true
    const tick = async () => { const s = await window.monke.stats(); if (alive) setStats(s) }
    tick(); const t = setInterval(tick, intervalMs)
    return () => { alive = false; clearInterval(t) }
  }, [intervalMs])
  return stats
}
