import { checks, type LabelSets, type Metrics } from '@/lib/score'

const pct = (x = 0) => `${Math.round(x * 100)}%`
const Tick = ({ ok }: { ok: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={ok ? 'text-emerald-400' : 'text-amber-300'}>
    <path d={ok ? 'M5 12l5 5L20 7' : 'M12 6v7m0 4v.5'} />
  </svg>
)

/** What Kimi returned for a clip, or null when it did not run. `check` is its verdict on the requested task. */
export type Kimi = {
  title?: string; quality_score?: number; steps?: string[]; reasons?: string[]
  labels?: { task?: string; industry?: string; perspective?: string; tools?: string[] }
  skill?: { level?: string; evidence?: string }
  check?: { seen?: string; matches?: boolean; completed?: string; evidence?: string } | null
} | null

/**
 * The stats of one processed clip. Every number here is measured or returned by a model, nothing is made up:
 * headline numbers, the quality checks measured on the device, then the two labelling systems side by side,
 * the open-source one (MediaPipe) and the language model (Kimi). Green means it passed.
 */
export default function ClipStats({ score, metrics, sets, earn, ai, aiError, requested }: { score: number; metrics: Metrics; sets: LabelSets; earn: number; ai?: Kimi; aiError?: string | null; requested?: string }) {
  const cs = checks(metrics)
  const passed = cs.filter((c) => c.score >= 0.7).length
  const objects = sets.objects ?? []
  const tiles: [string, string, string, boolean][] = [
    ['Quality score', `${score}/5`, score >= 4 ? 'Strong' : score >= 3 ? 'Good' : 'Needs work', score >= 3],
    ['Checks passed', `${passed}/${cs.length}`, passed === cs.length ? 'All clear' : `${cs.length - passed} to fix`, passed === cs.length],
    metrics.hands == null ? ['Length', `${Math.round(metrics.duration ?? 0)}s`, 'Recorded start to finish', true] : ['Hands in frame', pct(sets.hands?.coverage), (sets.hands?.coverage ?? 0) >= 0.8 ? 'Tracked' : 'Keep them in view', (sets.hands?.coverage ?? 0) >= 0.8],
    ['You earn per sale', `$${earn.toFixed(2)}`, 'At today’s rate', earn > 0],
  ]
  const row = 'grid gap-4 md:grid-cols-[7rem_1fr] md:gap-8'
  const done = ai?.check?.completed

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
          <div>
            <h3 className="text-lg font-semibold">Checks</h3>
            <p className="muted mt-1 text-xs">Measured from six frames of your clip</p>
          </div>
          <ul className="flex h-44 items-end gap-2 md:gap-4">
            {cs.map((c) => (
              <li key={c.key} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2 text-center">
                <div className={`mx-auto w-full max-w-14 rounded-full bg-linear-to-t ${c.score >= 0.7 ? 'from-sky-400 to-emerald-400' : 'from-rust to-amber-300'}`} style={{ height: `${Math.max(8, c.score * 100)}%` }} title={c.score < 0.7 ? c.tip : undefined} />
                <p className="text-[11px] leading-tight">{c.label}<span className="muted block">{c.value}</span></p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* two labelling systems, each showing only what it actually returned */}
      <div className={row}>
        <h3 className="text-lg font-semibold">Labelling</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-box bg-white/[.05] p-5">
            <p className="font-semibold">Open source</p>
            <p className="muted text-xs">MediaPipe object detector and hand tracker, run on your device</p>
            {objects.length ? (
              <ul className="mt-4 space-y-3">
                {objects.slice(0, 5).map((o) => (
                  <li key={o.name}>
                    <div className="flex justify-between text-sm"><span>{o.name}</span><span className="muted tabular-nums">{pct(o.confidence)} sure, in {o.frames} of 6 frames</span></div>
                    <div className="bar mt-1"><i className="!bg-emerald-400 !bg-none" style={{ width: pct(o.confidence) }} /></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-4 text-sm">No known objects seen. This model recognises 80 everyday objects such as a cup, bottle or scissors. It does not know cloth or trade tools.</p>
            )}
            {metrics.hands != null && <p className="mt-4 flex flex-wrap gap-1.5"><span className="stat">Hands in {pct(sets.hands?.coverage)} of frames</span><span className="stat">Hand confidence {pct(sets.hands?.confidence)}</span></p>}
          </div>

          <div className="rounded-box bg-white/[.05] p-5">
            <p className="font-semibold">Kimi</p>
            <p className="muted text-xs">Vision language model, run on the server</p>
            {ai ? (
              <div className="mt-4 space-y-3 text-sm">
                {requested && ai.check && (
                  <p className={`flex items-start gap-2 rounded-box p-3 ${ai.check.matches && done !== 'no' ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-300/15 text-amber-100'}`}>
                    <span className="mt-0.5"><Tick ok={!!ai.check.matches && done !== 'no'} /></span>
                    <span>{ai.check.matches ? 'This is the requested task' : 'This is not the requested task'}, {done === 'yes' ? 'and it was completed' : done === 'no' ? 'and it was not completed' : 'completion unclear'}. {ai.check.evidence}</span>
                  </p>
                )}
                <p><span className="muted">Task seen: </span>{ai.check?.seen || ai.title || 'not stated'}</p>
                <p className="flex flex-wrap gap-1.5">
                  {[ai.labels?.task, ai.labels?.industry, ai.labels?.perspective, ...(ai.labels?.tools ?? [])].filter(Boolean).map((x) => <span key={x} className="chip">{x}</span>)}
                  {ai.skill?.level && <span className="chip chip-slate">Skill: {ai.skill.level}</span>}
                  {ai.quality_score && <span className="chip chip-slate">Content {ai.quality_score}/5</span>}
                </p>
                {ai.steps && ai.steps.length > 0 && <ol className="muted list-decimal space-y-0.5 pl-5">{ai.steps.slice(0, 6).map((s) => <li key={s}>{s}</li>)}</ol>}
              </div>
            ) : (
              <p className="mt-4 rounded-box bg-amber-300/15 p-3 text-sm text-amber-100">Did not run, so the task and whether it was completed have not been checked by a model. {aiError ? `Reason: ${aiError}` : ''}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
