import { useEffect, useState, useCallback } from 'react'
import { Check, Loader2, CircleAlert } from 'lucide-react'
// Animated PNG, not a <video>: a video element routes through Chromium's ffmpeg
// and logs "Unsupported pixel format: -1" on every launch. An APNG is decoded by
// the image pipeline instead — same looping animation, no ffmpeg, no log noise.
import loadingAnim from '../../assets/loading-monkey-anim.png'

type Step = { key: string; ok: boolean; detail?: string }
const LABELS: Record<string, string> = {
  model: 'Model weights', runtime: 'Inference runtime', database: 'Local database', engine: 'Warming engine',
}

export default function LoadingScreen({ onReady }: { onReady: () => void }) {
  const [steps, setSteps] = useState<Step[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const boot = useCallback(() => {
    setError(null); setRetrying(true)
    // middleware: load everything before rendering the app
    window.monke.boot().then(res => {
      setSteps(res.steps); setRetrying(false)
      if (res.ok) setTimeout(onReady, 900)
      else setError(res.steps.filter(s => !s.ok).map(s => `${LABELS[s.key] || s.key}: ${s.detail || 'failed'}`).join('  ·  '))
    }).catch(e => { setRetrying(false); setError(String(e?.message || e)) })
  }, [onReady])

  useEffect(() => { boot() }, [boot])

  return (
    <div className="drag h-full w-full flex flex-col items-center justify-center bg-ink-900 fadein">
      <img src={loadingAnim} alt="Loading" draggable={false}
        className="w-[300px] h-[300px] object-contain pointer-events-none select-none" />
      <div className="mt-1 text-[22px] font-semibold tracking-tight">MONKE</div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-haze-400">Multiplier of Operations · Non Kernel · Effective</div>

      <div className="mt-8 w-[340px] space-y-2">
        {(steps.length ? steps : ['model', 'runtime', 'database', 'engine'].map(k => ({ key: k, ok: false } as Step))).map(s => (
          <div key={s.key} className="flex items-center gap-3 text-[13px]">
            <span className="w-4 h-4 grid place-items-center">
              {s.ok ? <Check size={14} className="text-emerald-400" />
                : error ? <CircleAlert size={14} className="text-rose-400" />
                : <Loader2 size={14} className="text-haze-300 animate-spin" />}
            </span>
            <span className={s.ok ? 'text-haze-200' : 'text-haze-400'}>{LABELS[s.key] || s.key}</span>
            {s.detail && <span className="ml-auto text-[11px] text-haze-400 truncate max-w-[190px]">{s.detail}</span>}
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-6 max-w-[420px] text-center text-[12px] text-rose-300/90 leading-relaxed selectable">
          {error}
          <div className="mt-2 text-haze-400">
            On a slow flash drive the first load can take a while — try again. Otherwise place model files in the <code>model/</code> folder and run <code>node native/build.mjs</code>.
          </div>
          <button
            onClick={boot}
            disabled={retrying}
            className="no-drag mt-4 px-4 py-1.5 rounded-lg text-[12px] bg-white/10 hover:bg-white/15 disabled:opacity-50 text-haze-100 transition"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  )
}
