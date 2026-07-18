export type UiMsg = { id?: string; role: 'user' | 'assistant'; text: string; tokS?: number | null }
export type Chat = { id: string; title: string; created_at: number; updated_at: number }
export type Stats = {
  ramUsedMb: number; ramTotalMb: number; ramPct: number; procRssMb: number
  gpu: { present: boolean; name: string; utilPct: number; memUsedMb: number; memTotalMb: number }
}
