import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql, requireUser, getMarket, priceOf } from '@/lib/server'
import { LABELS, GOLDEN_MULT, HOLD_DAYS, checks, payout, type Labels, type LabelSet, type LabelSets } from '@/lib/score'
import { verifyLabels } from '../../actions'
import ClipStats from '@/components/ClipStats'

type State = 'ok' | 'warn' | 'fail' | 'skip'
const DOT: Record<State, string> = { ok: 'bg-emerald-400', warn: 'bg-amber-300', fail: 'bg-red-400', skip: 'bg-white/25' }
const WORD: Record<State, string> = { ok: 'Done', warn: 'Check', fail: 'Failed', skip: 'Not run' }
const pct = (x = 0) => `${Math.round(x * 100)}%`

/** One stage of the pipeline, with its outputs underneath. */
function Stage({ n, title, state, by, children }: { n: number; title: string; state: State; by: string; children: React.ReactNode }) {
  return (
    <li className="card grid gap-3 p-5 md:grid-cols-[14rem_1fr] md:gap-6">
      <div>
        <p className="muted text-xs tabular-nums">Stage {n}</p>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${DOT[state]}`} aria-hidden />{WORD[state]}<span className="muted">{by}</span></p>
      </div>
      <div className="min-w-0 space-y-3 text-sm">{children}</div>
    </li>
  )
}

/** Model output: each label with its confidence and how many of the sampled frames it showed up in. */
function Confidence({ rows }: { rows: LabelSet }) {
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((l) => (
        <li key={l.name}>
          <div className="flex justify-between gap-2"><span className="truncate">{l.name}</span><span className="muted whitespace-nowrap text-xs tabular-nums">{pct(l.confidence)}, {l.frames} of 6 frames</span></div>
          <div className="bar mt-1"><i style={{ width: pct(l.confidence) }} /></div>
        </li>
      ))}
    </ul>
  )
}

// The seller's private processing report: every stage a clip went through, what each model said, and the human check.
export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const user = await requireUser()
  const [[r], events, market, sales] = await Promise.all([
    sql`select u.*, ${user.years ?? 0}::int as years from uploads u where u.id = ${id} and u.seller_id = ${user.id}`,
    sql`select kind, data, created_at from events where upload_id = ${id} order by id`,
    getMarket(),
    sql`select p.price, p.call_id, c.title from purchases p left join calls c on c.id = p.call_id where p.upload_id = ${id}`,
  ])
  if (!r) notFound()
  const ev = (k: string) => events.find((e) => e.kind === k)?.data
  const observed = ev('observed') ?? {}, auth = observed.authenticity, priced = ev('priced'), unverified = ev('unverified'), dup = ev('duplicate')
  const sets: LabelSets = r.labelsets ?? {}
  const l: Labels = r.labels ?? {}
  const listed = r.status === 'scored' && r.quality_score >= 2 && !r.withdrawn_at && !dup && !unverified
  const price = listed ? priceOf(r, market) : 0
  const bounty = sales.find((s) => s.call_id)
  const done = [auth?.passed, !dup, !!sets.objects || !!sets.scene, !!r.ai, r.status === 'scored', r.golden].filter(Boolean).length

  const pickLabel = (k: 'task' | 'industry' | 'perspective' | 'outcome', name: string) => (
    <div>
      <label className="label" htmlFor={k}>{name}</label>
      <select id={k} name={k} className="input" defaultValue={l[k] ?? ''}>
        <option value="">Not set</option>
        {LABELS[k].map((o) => <option key={o}>{o}</option>)}
      </select>
      {r.ai?.labels?.[k] && <p className="muted mt-1 text-xs">LLM said: {r.ai.labels[k]}</p>}
    </div>
  )

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <Link href="/sell" className="muted text-sm underline underline-offset-4">Back to my uploads</Link>
        <h1 className="mt-3 text-3xl md:text-5xl">Processing report</h1>
        <p className="muted mt-2 text-sm">{r.title || 'Untitled clip'}. Submitted {new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')} UTC.</p>
      </div>

      <section className="card card-warm grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-sm font-semibold">{done} of 6 stages complete</p>
          <div className="bar mt-2 !h-2"><i style={{ width: pct(done / 6) }} /></div>
          <p className="mt-3 text-sm text-paper/80">
            {dup ? 'Not listed: this matches a clip that was already submitted.' : unverified ? `Not listed: ${unverified.reason}.` : listed ? `Listed at $${price}. You get $${payout(price).toFixed(2)} per sale, released after ${HOLD_DAYS} days.` : r.withdrawn_at ? 'Withdrawn from the market.' : 'Not listed: the quality score is below 2.'}
            {bounty && ` Request accepted: $${bounty.price} guaranteed for "${bounty.title}".`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="stat bg-ink/40 text-base">Score {r.quality_score ?? '-'}/5</span>
          {r.golden && <span className="stat bg-ink/40 text-base">Golden</span>}
          {listed && <Link href={`/buy/${r.id}`} className="btn !min-h-9 text-sm">View listing</Link>}
        </div>
      </section>

      {listed && <ClipStats score={r.quality_score} metrics={r.metrics ?? {}} sets={sets} earn={payout(price)} />}

      <ol className="space-y-3">
        <Stage n={1} title="Capture and authenticity" by="on your device" state={observed.capture === 'screen' ? 'ok' : observed.capture === 'gallery' ? 'warn' : !auth ? 'skip' : auth.passed ? 'ok' : 'fail'}>
          {observed.capture === 'screen' && <p>A screen recording, captured in the app. The hand-tracking steps do not apply.</p>}
          {observed.capture === 'gallery' && <p>Uploaded from your gallery. It could not be verified as filmed live, and buyers see that on the listing. Record in the app for verified clips.</p>}
          {auth ? (
            <p className="flex flex-wrap gap-1.5">
              <span className="stat">Live challenge {auth.challenge ? 'passed' : 'failed'}{observed.challenges?.[0]?.prompt ? `: ${observed.challenges[0].prompt}` : ''}</span>
              <span className="stat">Hand tracking covers {pct(auth.tracking)}</span>
              <span className="stat">Motion sensors {auth.sensors ? 'recorded' : 'not available'}</span>
            </p>
          ) : observed.capture ? null : <p className="muted">No capture record for this clip.</p>}
        </Stage>

        <Stage n={2} title="Quality and originality" by="on your device" state={dup ? 'fail' : r.metrics ? 'ok' : 'skip'}>
          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {checks(r.metrics ?? {}).map((c) => (
              <li key={c.key}>
                <div className="flex justify-between"><span>{c.label}</span><span className="muted text-xs">{c.value}</span></div>
                <div className="bar mt-1"><i style={{ width: pct(c.score) }} /></div>
              </li>
            ))}
          </ul>
          <p><span className={`stat ${dup ? 'stat-warm' : ''}`}>Originality: {observed.originality ?? 'not checked'}</span></p>
        </Stage>

        <Stage n={3} title="Open-source labelling" by="free, MediaPipe on your device" state={sets.objects?.length || sets.scene?.length ? 'ok' : 'skip'}>
          {sets.objects?.length ? (
            <div>
              <p className="label">Objects in frame, EfficientDet-Lite0</p>
              <Confidence rows={sets.objects} />
            </div>
          ) : <p className="muted">Object detection found nothing above its confidence threshold.</p>}
          {sets.scene?.length ? (
            <div>
              <p className="label">Scene, EfficientNet-Lite0</p>
              <Confidence rows={sets.scene} />
            </div>
          ) : null}
          {sets.hands && r.metrics?.hands != null && <p className="flex flex-wrap gap-1.5"><span className="stat">Hands in {pct(sets.hands.coverage)} of frames</span><span className="stat">Hand confidence {pct(sets.hands.confidence)}</span></p>}
        </Stage>

        <Stage n={4} title="LLM labelling" by="Kimi vision model, on the server" state={r.ai ? 'ok' : 'skip'}>
          {r.ai ? (
            <>
              <p className="flex flex-wrap gap-1.5">
                {[r.ai.labels?.task, r.ai.labels?.industry, r.ai.labels?.perspective, ...(r.ai.labels?.tools ?? [])].filter(Boolean).map((x: string) => <span key={x} className="chip">{x}</span>)}
                <span className="stat">Content score {r.ai.quality_score ?? '?'}/5</span>
                <span className="stat">Skill: {r.ai.skill?.level}</span>
              </p>
              {r.ai.steps?.length > 0 && <ol className="muted list-decimal pl-5">{r.ai.steps.map((s: string) => <li key={s}>{s}</li>)}</ol>}
              {r.ai.reasons?.length > 0 && <p className="muted">{r.ai.reasons.join(' ')}</p>}
              {r.ai.flags?.length > 0 && <p className="text-amber-200">Flags: {r.ai.flags.join(', ')}</p>}
            </>
          ) : <p className="muted">Did not run: {ev('proposed')?.error ?? 'no result recorded'}. Buyers cannot choose LLM labelling for this clip until it does.</p>}
        </Stage>

        <Stage n={5} title="Score and price" by="market" state={priced ? 'ok' : dup || unverified ? 'fail' : 'skip'}>
          {priced ? (
            <p className="flex flex-wrap gap-1.5">
              <span className="stat">Technical {pct(priced.technical)}</span>
              <span className="stat">Labels {pct(priced.completeness)}</span>
              <span className="stat">{priced.model_score ? `LLM ${priced.model_score}/5` : 'No LLM score'}</span>
              <span className="stat stat-warm">Market rate ${priced.rate}/h</span>
            </p>
          ) : <p className="muted">Not priced.</p>}
        </Stage>

        <Stage n={6} title="Human check" by="you" state={r.golden ? 'ok' : listed ? 'warn' : 'skip'}>
          {r.golden ? (
            <p>Golden: you checked these labels by hand. Buyers can choose Guild verified labelling, and the clip lists {Math.round((GOLDEN_MULT - 1) * 100)}% higher.</p>
          ) : !listed ? (
            <p className="muted">Only listed clips can be checked.</p>
          ) : (
            <form action={verifyLabels} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <p>Check the labels against what you filmed. A clip you have checked by hand becomes a golden clip and lists {Math.round((GOLDEN_MULT - 1) * 100)}% higher.</p>
              {error && <p role="alert" className="text-red-300">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                {pickLabel('task', 'Task')}
                {pickLabel('industry', 'Industry')}
                {pickLabel('perspective', 'Camera view')}
                {pickLabel('outcome', 'How it went')}
              </div>
              <div>
                <label className="label" htmlFor="tools">Tools and objects, comma separated</label>
                <input id="tools" name="tools" className="input" defaultValue={(l.tools ?? []).join(', ')} />
                {sets.objects?.length ? <p className="muted mt-1 text-xs">Detector saw: {sets.objects.map((o) => o.name).join(', ')}</p> : null}
              </div>
              <div>
                <label className="label" htmlFor="steps">Steps</label>
                <textarea id="steps" name="steps" className="input" rows={3} defaultValue={r.steps || (r.ai?.steps ?? []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')} />
              </div>
              <input name="note" className="input" maxLength={500} placeholder="What you corrected, if anything (goes on the evidence trail)" aria-label="Review note" />
              <label className="flex items-start gap-2"><input type="checkbox" name="watched" className="mt-1" required /> I watched the clip and every label above is correct.</label>
              <button className="btn btn-warm">Mark as golden</button>
            </form>
          )}
        </Stage>
      </ol>
    </main>
  )
}
