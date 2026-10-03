import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql, getUser, getMarket, priceOf, getReputation } from '@/lib/server'
import { checks, packages, unavailable, tier, signal, ACCEPT_REASONS, PASS_REASONS, BASE_RATE, LICENCE, taskPhoto, type Labels } from '@/lib/score'
import { buy, pass, reportResult } from '../../actions'

const HEAD: Record<string, string> = {
  observed: 'Observed on the device', proposed: 'Model proposed', changed: 'Reviewer changed', kept: 'Reviewer kept their labels',
  priced: 'Scored and priced', ask: 'Seller ask', accepted: 'Buyer accepted', passed: 'Buyer passed', task_check: 'Task check against the request', labelled: 'Open-source models labelled it on the device', golden: 'Seller checked every label by hand: golden clip', result: 'Buyer reported a training result',
  duplicate: 'Flagged as a copy of a clip already on Guild. Not listed', unverified: 'Could not verify this was filmed live. Not listed', withdrawn: 'Seller withdrew the clip from the market', relisted: 'Seller put the clip back on the market',
}
const labelText = (l: Labels = {}) => [l.task, l.industry, l.perspective, l.device, ...(l.tools ?? [])].filter(Boolean).join(', ')
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v ? String(v) : 'none')
const pct = (x: number) => `${Math.round(x * 100)}%`

/** One trail event as plain sentences. */
function lines(kind: string, d: any): string[] {
  switch (kind) {
    case 'observed':
      return [checks(d.metrics ?? {}).map((c) => `${c.label}: ${c.value}`).join(', ') || 'No frames could be measured', `Seller entered: ${labelText(d.labels) || 'no labels'}`, d.authenticity ? `Filmed live in the app: challenge ${d.authenticity.challenge ? 'passed' : 'failed'}${d.challenges?.[0]?.prompt ? ` (${d.challenges[0].prompt})` : ''}, hand tracking covers ${pct(d.authenticity.tracking)}, motion sensors ${d.authenticity.sensors ? 'recorded' : 'not available on this device'}` : d.episode ? 'Hand-pose episode attached' : '']
    case 'proposed':
      return d.error ? [`Review did not run: ${d.error}`] : [`Labels: ${labelText(d.labels) || 'none'}`, `Skill: ${d.skill?.level}. ${d.skill?.evidence ?? ''}`, `Content score ${d.quality_score ?? '?'}/5. ${(d.reasons ?? []).join(' ')}`, d.flags?.length ? `Flags: ${d.flags.join(', ')}` : '']
    case 'changed':
      return [...(d.fields ?? []).map((k: string) => `${k}: ${show(d.before?.[k])} to ${show(d.after?.[k])}`), `Score ${d.score_before} to ${d.score_after}`]
    case 'kept':
      return [`Model said: ${labelText(d.proposed) || 'none'}`, `Kept: ${labelText(d.kept) || 'none'}`]
    case 'priced':
      return [`Score ${d.score}/5 from technical ${pct(d.technical)}, labels ${pct(d.completeness)}${d.model_score ? `, model ${d.model_score}/5` : ', no model score'}`, `Market rate $${d.rate}/h, listed at $${d.price}`]
    case 'ask':
      return [d.ask ? `Set to $${d.ask}. Market price was $${d.market}` : 'Cleared. Back to the market price']
    case 'accepted':
      return [`${d.package} for $${d.price}${d.via === 'bid' ? ', filled from a standing bid' : ''}`, `Why: ${(d.reasons ?? []).join(', ') || 'see note'}`]
    case 'task_check':
      return [d.kimi ? `Kimi: ${d.kimi.matches ? 'it is the requested task' : `a different task (${d.kimi.seen})`}, completed: ${d.kimi.completed}. ${d.kimi.evidence ?? ''}` : 'Kimi did not run, so the task was not checked by a model', d.objects_required?.length ? `Open-source detector: ${d.objects_missing?.length ? `did not see ${d.objects_missing.join(', ')}` : `saw ${d.objects_required.join(', ')}`}` : '']
    case 'labelled':
      return [d.objects?.length ? `Objects: ${d.objects.map((o: any) => `${o.name} ${pct(o.confidence)}`).join(', ')}` : 'No objects above the confidence threshold', d.scene?.length ? `Scene: ${d.scene.map((o: any) => `${o.name} ${pct(o.confidence)}`).join(', ')}` : '']
    case 'golden':
      return [(d.fields ?? []).length ? `Corrected: ${d.fields.join(', ')}` : 'Confirmed every label as it was', `Score ${d.score_before} to ${d.score_after}`]
    case 'result':
      return [`Outcome: ${d.outcome}${d.metric ? ` (${d.metric})` : ''}`, d.bonus ? `Seller bonus $${d.bonus}` : '']
    case 'passed':
      return [`Why not: ${(d.reasons ?? []).join(', ') || 'see note'}`]
  }
  return []
}

export default async function Listing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params
  const { error } = await searchParams
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const user = await getUser()
  const [[r], events, market] = await Promise.all([
    sql`select u.*, s.name as seller, s.org, s.trade, s.years, s.credential, s.verified from uploads u join users s on s.id = u.seller_id where u.id = ${id}`,
    sql`select id, actor, actor_id, kind, data, note, created_at from events where upload_id = ${id} order by id`,
    getMarket(),
  ])
  if (!r) notFound()
  const capture: string | undefined = (events as any[]).find((e) => e.kind === 'observed')?.data?.capture
  const mine = user?.id === r.seller_id
  if (!mine && (r.status !== 'scored' || r.quality_score < 2)) notFound()
  const owned = user ? (await sql`select package from purchases where upload_id = ${id} and buyer_id = ${user.id}`).map((p) => p.package) : []
  const raw = mine || owned.length > 0 // every option includes the raw data
  const has = (k: string) => mine || owned.includes(k) || owned.includes('both') || owned.includes('processed') || (k !== 'verified' && owned.includes('verified'))
  const processed = mine || owned.some((k) => k !== 'byo' && k !== 'raw')
  const l: Labels = r.labels ?? {}
  const photo: string | null = r.thumb ?? taskPhoto(l.task)
  if (!mine && r.withdrawn_at && !owned.length) notFound() // withdrawn: only the seller and past buyers still see it
  const steps: string[] = r.ai?.steps?.length ? r.ai.steps : (r.steps ?? '').split('\n').filter(Boolean)
  // Something the worker gets back: a dated record of the job for their customer or their own files.
  const jobRecord = [
    'JOB RECORD', r.title, `Date: ${new Date(r.created_at).toISOString().slice(0, 10)}`,
    `Done by: ${r.seller}${r.trade ? `, ${r.trade}, ${r.years} years` : ''}${r.credential ? `, ${r.credential}` : ''}`,
    `Tools: ${(l.tools ?? []).join(', ') || 'not recorded'}`, '', 'Steps',
    ...steps.map((s, i) => `${i + 1}. ${s.replace(/^\d+[.)]\s*/, '')}`), '',
    `Footage quality ${r.quality_score}/5. Recorded and logged on Guild.`,
  ].join('\n')

  // Buyer decisions are that buyer's own knowledge: full detail to them and the seller, a bare line to everyone else, passes hidden.
  const trail: any[] = (events as any[])
    .filter((e) => e.kind !== 'passed' || mine || e.actor_id === user?.id)
    .map((e) => {
      const priv = (e.kind === 'accepted' || e.kind === 'passed' || e.kind === 'result') && !mine && e.actor_id !== user?.id
      return { ...e, text: priv ? [] : lines(e.kind, e.data ?? {}).filter(Boolean), note: priv ? null : e.note }
    })
  // Evaluation: how often the model's label matched what the human reviewer ended with.
  const proposed: Labels = r.ai?.labels ?? {}
  const keys = (['perspective', 'task', 'industry'] as const).filter((k) => proposed[k])
  const agree = keys.filter((k) => proposed[k] === l[k]).length

  const m = market[l.task ?? '']
  const price = priceOf(r, market)
  const hours = r.minutes / 60
  const report = { title: r.title, quality_score: r.quality_score, metrics: r.metrics, labelling: { open_source_objects: r.labelsets?.objects, open_source_scene: r.labelsets?.scene, hand_tracking: r.labelsets?.hands, llm: has('llm') ? r.ai : undefined, human_verified: has('verified') && r.golden ? { labels: l, steps } : undefined, seller_entered: has('llm') || has('verified') ? { labels: l, steps } : undefined }, seller: { trade: r.trade, years: r.years, credential: r.credential }, evidence_trail: trail.map(({ kind, actor, data, note, created_at }) => ({ kind, actor, data, note, created_at })) }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Link href="/buy" className="muted text-sm underline underline-offset-4">Back to marketplace</Link>
        {raw && r.video_url ? (
          <video src={r.video_url} controls playsInline className="card aspect-video w-full" />
        ) : photo ? (
          <img src={photo} alt="" className={`card aspect-video w-full object-cover ${r.thumb ? '' : 'photo'}`} />
        ) : (
          <div className="card streaks grid aspect-video place-items-center"><span className="emboss text-6xl font-semibold">{l.task}</span></div>
        )}
        <div>
          <h1 className="text-3xl md:text-4xl">{r.title}</h1>
          <p className="muted mt-2 flex items-center gap-2 text-sm">
            <span className="score" style={{ '--s': r.quality_score } as React.CSSProperties} /> {r.quality_score}/5,
            {r.minutes >= 60 ? ` ${Math.round(hours)} hours` : ` ${Math.max(1, Math.round(r.minutes))} min`}
            {!r.video_url && ', sample listing'}
            {r.golden && <span className="chip chip-warm ml-1">Golden: labels checked by hand</span>}
            {capture === 'gallery' && <span className="chip ml-1">Gallery upload, not verified live</span>}
            {capture === 'screen' && <span className="chip chip-slate ml-1">Screen recording</span>}
          </p>
        </div>
        <p className="text-sm">{r.description}</p>
        <p className="flex flex-wrap gap-1.5">
          {[l.task, l.industry, l.perspective, l.device, ...(l.tools ?? [])].filter(Boolean).map((c) => <span key={c} className="chip">{c}</span>)}
        </p>

        <section className="card p-5" aria-labelledby="trail">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="trail" className="text-2xl">Evidence trail</h2>
            {keys.length > 0 && <span className="chip chip-slate">Model and reviewer agree on {agree} of {keys.length} labels</span>}
          </div>
          <p className="muted mt-1 text-sm">What was measured, what the model proposed, what a person changed, and why buyers took it. Nothing here can be edited after the fact.</p>
          {!trail.length && <p className="muted mt-4 text-sm">Sample listing, seeded for the demo. It has no trail. Real uploads record every step.</p>}
          <ol className="mt-4 space-y-4 border-l border-tan/40 pl-5">
            {trail.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-slate" aria-hidden />
                <p className="text-sm font-medium">
                  {HEAD[e.kind] ?? e.kind}{e.kind === 'proposed' && e.data?.model ? ` (${e.data.model})` : ''}
                  <time className="muted ml-2 text-xs font-normal">{new Date(e.created_at).toISOString().slice(0, 16).replace('T', ' ')} UTC</time>
                </p>
                {e.text.map((t: string) => <p key={t} className="muted text-sm">{t}</p>)}
                {e.note && <p className="mt-1 border-l-2 border-slate/50 pl-3 text-sm">{e.note}</p>}
              </li>
            ))}
          </ol>
        </section>

        <section className="card space-y-2 p-5">
          <p className="label">Who filmed it</p>
          <p>{r.org || r.seller}. {r.trade ? `${r.trade}, ${r.years} years.` : ''} <span className="chip chip-slate">{tier(r.years).name}</span> {r.verified && <span className="chip chip-slate">Licence verified</span>}</p>
          {r.credential && <p className="muted text-sm">Credential ({r.verified ? 'checked by Guild' : 'self-declared, not yet checked'}): {r.credential}</p>}
        </section>

        <section className="card space-y-2 p-5">
          <p className="label">How it was captured, and the licence</p>
          <p className="text-sm">{capture === 'in-app' ? 'Recorded inside the Guild app, with a live hand-motion trace.' : capture === 'screen' ? 'A screen recording of the task, captured in the app.' : capture ? 'Uploaded from the seller’s gallery. Not verified as filmed live.' : 'Sample listing, no capture record.'}</p>
          <ul className="muted list-disc space-y-1 pl-5 text-sm">{LICENCE.terms.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>

        {steps.length > 0 && (
          <section className="card p-5">
            <p className="label">Steps</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{steps.map((s) => <li key={s}>{s.replace(/^\d+[.)]\s*/, '')}</li>)}</ol>
          </section>
        )}
      </div>

      <aside className="space-y-3 md:sticky md:top-20 md:self-start">
        {(raw || processed) && (
          <div className="card space-y-3 p-5">
            <p className="label">{mine ? 'Your files' : 'Purchased'}</p>
            {raw && (r.video_url ? <a className="btn w-full" href={r.video_url} download>Download raw video</a> : <p className="muted text-sm">Sample listing, no raw file attached.</p>)}
            {raw && r.video_url && !mine && <a className="btn btn-ghost w-full" download="label-studio-task.json" href={`data:application/json,${encodeURIComponent(JSON.stringify([{ data: { video: r.video_url, clip_id: r.id } }]))}`}>Label Studio task file</a>}
            {processed && <a className="btn btn-ghost w-full" download="labels-and-evidence.json" href={`data:application/json,${encodeURIComponent(JSON.stringify(report, null, 2))}`}>Download labels and evidence trail</a>}
            {processed && r.episode_url && <a className="btn btn-ghost w-full" href={r.episode_url} download>Download hand-pose episode</a>}
            {mine && <a className="btn btn-ghost w-full" download="job-record.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(jobRecord)}`}>Download job record</a>}
            {mine && <p className="muted text-xs">A dated record of the job and its steps, for your customer or your own files.{r.withdrawn_at ? ' This clip is withdrawn from the market.' : ''}</p>}
          </div>
        )}

        <div className="card space-y-1 p-5 text-sm">
          <p className="label">How this price is set</p>
          {r.ask ? (
            <p>The seller asks ${r.ask}. The market price would be ${priceOf({ ...r, ask: null }, market)}.</p>
          ) : (
            <p>${(m?.rate ?? BASE_RATE).toFixed(2)}/h market rate x {hours < 1 ? `${Math.round(r.minutes)} min` : `${hours.toFixed(1)} h`} x score {r.quality_score}/4 x {tier(r.years).mult} ({tier(r.years).name}){r.golden ? ' x 1.3 golden' : ''} = ${price}{price === 5 ? ' (minimum)' : ''}</p>
          )}
          {m && <p className="muted">{l.task}: {signal(m).toLowerCase()}. {Math.round(m.demand)} h wanted, {m.supply.toFixed(1)} h listed{m.last ? `, last sale $${m.last.toFixed(0)}/h` : ''}. <Link href="/market" className="underline underline-offset-4">Prices</Link></p>}
          <p className="muted">80% goes to the seller.</p>
        </div>

        {!mine && !r.withdrawn_at && (
          <form action={buy} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={r.id} />
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <div className="flex items-baseline justify-between">
              <span className="label !mb-0">Raw data</span>
              <span className="text-2xl font-light tabular-nums">${price.toLocaleString('en-US')}</span>
            </div>
            <p className="muted text-xs">Video, hand-pose episode and motion data. 80% to the seller, 20% platform fee.</p>
            {/* labelling is a separate line: bring your own, two free open-source models, the LLM, or human-verified */}
            <fieldset className="space-y-2">
              <legend className="label">How should it be labelled?</legend>
              {packages(price).map((p, i) => {
                const why = unavailable(p.key, r)
                return (
                  <label key={p.key} className={`flex items-start gap-3 rounded-box bg-white/5 p-3 has-[:checked]:bg-tan/60 ${why ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input type="radio" name="package" value={p.key} defaultChecked={i === 0} disabled={!!why} className="mt-1" />
                    <span className="flex-1">
                      <span className="flex justify-between gap-3">
                        <span className="font-medium">{p.name}{owned.includes(p.key) ? ' (owned)' : ''}</span>
                        <span className="whitespace-nowrap tabular-nums">{p.labelling ? `+ $${p.labelling.toLocaleString('en-US')}` : 'Free'}</span>
                      </span>
                      <span className="muted block text-xs">{why ? `${why}.` : p.what}</span>
                    </span>
                  </label>
                )
              })}
            </fieldset>
            <fieldset>
              <legend className="label">Why are you accepting it?</legend>
              <div className="flex flex-wrap gap-2">
                {ACCEPT_REASONS.map((x) => <label key={x} className="chip cursor-pointer has-[:checked]:bg-paper has-[:checked]:text-ink"><input type="checkbox" name="reasons" value={x} className="sr-only" />{x}</label>)}
              </div>
            </fieldset>
            <input name="note" className="input" maxLength={500} placeholder="Anything specific (optional)" aria-label="Acceptance note" />
            <button className="btn w-full">{user ? 'Accept and buy licence' : 'Sign in to buy'}</button>
            <p className="muted text-xs">Your reasons build your private acceptance profile and go on this clip&apos;s trail. Non-exclusive licence, seller keeps ownership. Demo: no money moves.</p>
          </form>
        )}
        {!mine && user && (
          <details className="card p-5">
            <summary className="cursor-pointer text-sm">Not for us</summary>
            <form action={pass} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <div className="flex flex-wrap gap-2">
                {PASS_REASONS.map((x) => <label key={x} className="chip cursor-pointer has-[:checked]:bg-paper has-[:checked]:text-ink"><input type="checkbox" name="reasons" value={x} className="sr-only" />{x}</label>)}
              </div>
              <input name="note" className="input" maxLength={500} placeholder="What would make it usable?" aria-label="Pass note" />
              <button className="btn btn-ghost w-full">Pass on this clip</button>
            </form>
          </details>
        )}
      </aside>
    </main>
  )
}
