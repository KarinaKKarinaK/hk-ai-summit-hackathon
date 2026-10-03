import { checks, type LabelSets, type Metrics } from '@/lib/score'

const pct = (x = 0) => `${Math.round(x * 100)}%`
const Tick = ({ ok }: { ok: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={ok ? 'text-emerald-400' : 'text-amber-300'}>
    <path d={ok ? 'M5 12l5 5L20 7' : 'M12 6v7m0 4v.5'} />
  </svg>
)

/**
 * The stats of one processed clip, laid out as three rows: headline numbers, the quality checks as
 * bars, and what the models found as bubbles sized by confidence. Green means it passed.
 */
export default function ClipStats({ score, metrics, sets, earn }: { score: number; metrics: Metrics; sets: LabelSets; earn: number }) {
  const cs = checks(metrics)
  const passed = cs.filter((c) => c.score >= 0.7).length
  const found = [...(sets.objects ?? []), ...(sets.scene ?? [])].sort((a, b) => b.confidence - a.confidence).slice(0, 7)
  const tiles: [string, string, string, boolean][] = [
    ['Quality score', `${score}/5`, score >= 4 ? 'Strong' : score >= 3 ? 'Good' : 'Needs work', score >= 3],
    ['Checks passed', `${passed}/${cs.length}`, passed === cs.length ? 'All clear' : `${cs.length - passed} to fix`, passed === cs.length],
    metrics.hands == null ? ['Length', `${Math.round(metrics.duration ?? 0)}s`, 'Recorded start to finish', true] : ['Hands in frame', pct(sets.hands?.coverage), (sets.hands?.coverage ?? 0) >= 0.8 ? 'Tracked' : 'Keep them in view', (sets.hands?.coverage ?? 0) >= 0.8],
    ['You earn per sale', `$${earn.toFixed(2)}`, 'At today’s rate', earn > 0],
  ]
  const row = 'grid gap-4 md:grid-cols-[7rem_1fr] md:gap-8'

  return (
    <section className="card space-y-10 p-6 md:p-8">
      <div className={row}>
        <h3 className="text-lg font-semibold">Result</h3>
        <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {tiles.map(([k, v, note, ok]) => (
            <div key={k}>
              <dt className="muted text-sm">{k}</dt>
              <dd className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{v}</dd>
              <dd className={`mt-1 flex items-center gap-1 text-xs ${ok ? 'text-emerald-400' : 'text-amber-300'}`}><Tick ok={ok} />{note}</dd>
            </div>
          ))}
        </dl>
      </div>

      {cs.length > 0 && (
        <div className={row}>
          <h3 className="text-lg font-semibold">Checks</h3>
          <ul className="flex h-44 items-end gap-2 md:gap-4">
            {cs.map((c) => (
              <li key={c.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center">
                <div className={`mx-auto w-full max-w-14 rounded-full bg-linear-to-t ${c.score >= 0.7 ? 'from-sky-400 to-emerald-400' : 'from-rust to-amber-300'}`} style={{ height: `${Math.max(8, c.score * 100)}%` }} title={c.score < 0.7 ? c.tip : undefined} />
                <p className="truncate text-[11px] leading-tight">{c.label}<span className="muted block">{c.value}</span></p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={row}>
        <h3 className="text-lg font-semibold">Found</h3>
        {found.length ? (
          <ul className="flex flex-wrap items-center gap-3">
            {found.map((l, i) => {
              const d = 56 + l.confidence * 72
              return (
                <li key={l.name} className="text-center">
                  <div className={`grid place-items-center rounded-full text-sm font-medium tabular-nums ${i === 0 ? 'bg-linear-to-br from-emerald-400 to-sky-400 text-ink' : 'bg-white/10'}`} style={{ width: d, height: d }}>{pct(l.confidence)}</div>
                  <p className="muted mt-1.5 max-w-24 truncate text-[11px]">{l.name}</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted text-sm">The open-source models found nothing above their confidence threshold.</p>
        )}
      </div>
    </section>
  )
}
