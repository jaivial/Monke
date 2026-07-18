// Cross-platform system stats: host RAM + GPU (nvidia-smi if present, else none).
import { totalmem, freemem } from 'node:os'
import { execFile } from 'node:child_process'

export type Stats = {
  ramUsedMb: number; ramTotalMb: number; ramPct: number
  procRssMb: number
  gpu: { present: boolean; name: string; utilPct: number; memUsedMb: number; memTotalMb: number }
}

let gpuChecked = false
let gpuAvailable = false

function nvidia(): Promise<Stats['gpu']> {
  return new Promise((resolve) => {
    execFile('nvidia-smi',
      ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 1500 },
      (err, stdout) => {
        if (err || !stdout) { gpuAvailable = false; return resolve({ present: false, name: 'none', utilPct: 0, memUsedMb: 0, memTotalMb: 0 }) }
        const [name, util, used, total] = stdout.split('\n')[0].split(',').map(s => s.trim())
        gpuAvailable = true
        resolve({ present: true, name, utilPct: +util || 0, memUsedMb: +used || 0, memTotalMb: +total || 0 })
      })
  })
}

export async function sample(procRssMb: number): Promise<Stats> {
  const total = totalmem() / 1048576, free = freemem() / 1048576
  const used = total - free
  let gpu: Stats['gpu'] = { present: false, name: 'none', utilPct: 0, memUsedMb: 0, memTotalMb: 0 }
  if (!gpuChecked || gpuAvailable) { gpu = await nvidia(); gpuChecked = true }
  return {
    ramUsedMb: Math.round(used), ramTotalMb: Math.round(total), ramPct: Math.round((used / total) * 100),
    procRssMb: Math.round(procRssMb), gpu,
  }
}
