import Link from 'next/link'
import { sql, getUser } from '@/lib/server'
import { LABELS } from '@/lib/score'
import Glyph, { taskGlyph } from '@/components/Glyph'
import { postCall } from '../actions'

export default async function Calls({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const user = await getUser()
  const rows = await sql`select c.*, coalesce(b.org, b.name) as buyer, (select count(*)::int from purchases p where p.call_id = c.id) as clips,
      (select count(distinct u.seller_id)::int from purchases p join uploads u on u.id = p.upload_id where p.call_id = c.id) as people
    from calls c join users b on b.id = c.buyer_id order by c.created_at desc`

  return (
    <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl md:text-5xl">Requests</h1>
          <p className="muted mt-2 text-sm">Buyers request exactly the data their model is missing, with a budget. Record for a request and the payout is guaranteed once the clip passes the checks.</p>
        </div>
        <ul className="grid gap-3">
          {rows.map((c) => {
            const total = c.hours_total ?? c.hours, done = Math.max(0, total - c.hours)
            const spec = [c.perspective && `${c.perspective} view`, c.environment && `In: ${c.environment}`, c.objects && `Must show: ${c.objects}`, c.min_seconds && `At least ${c.min_seconds}s per clip`].filter(Boolean)
            return (
              <li key={c.id} className="card overflow-hidden">
                {/* who and what on the left, the rate in its own box on the right */}
                {/* a cover icon for the kind of work, then the title and who is asking */}
                <div className="flex items-center gap-4 p-4">
                  <div className="card-warm h-20 w-20 flex-none overflow-hidden rounded-2xl md:h-24 md:w-24"><Glyph name={taskGlyph(c.task)} className="h-full w-full" /></div>
                  <div className="min-w-0">
                    <p className="flex flex-wrap gap-1.5">{[c.task, c.industry].filter(Boolean).map((x: string) => <span key={x} className="chip chip-warm">{x}</span>)}</p>
                    <h2 className="mt-1.5 text-base font-semibold leading-snug md:text-xl">{c.title}</h2>
                    <p className="muted mt-1 text-xs">{c.buyer}</p>
                  </div>
                </div>
                {c.weakness && <p className="mx-4 mb-3 rounded-xl bg-white/[.05] px-3 py-2 text-sm"><span className="muted">Model gap: </span>{c.weakness}</p>}
                {/* three numbers, one per box: the pay is the warm one */}
                <dl className="mx-4 grid grid-cols-3 gap-2">
                  {[
                    [`$${c.rate}/h`, 'pays', 'card-warm'],
                    [`${done.toFixed(done ? 1 : 0)} / ${Math.round(total)} h`, 'collected', 'bg-white/[.05]'],
                    [`$${Math.round(total * c.rate).toLocaleString('en-US')}`, 'budget', 'bg-white/[.05]'],
                  ].map(([v, k, tone]) => (
                    <div key={k} className={`rounded-xl px-3 py-2.5 ${tone}`}>
                      <dt className="text-base font-medium tabular-nums md:text-lg">{v}</dt>
                      <dd className="muted text-[11px] uppercase tracking-wider">{k}</dd>
                    </div>
                  ))}
                </dl>
                <div className="space-y-3 p-4">
                  <div className="bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                  <p className="flex flex-wrap items-center gap-1.5">
                    {c.demos && <span className="chip">{c.clips} / {c.demos} demos</span>}
                    {c.min_people && <span className="chip">{c.people} / {c.min_people} people</span>}
                    {spec.map((s) => <span key={s as string} className="chip">{s}</span>)}
                    {c.wants_failures && <span className="chip">Failure and recovery wanted</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/record?request=${c.id}&title=${encodeURIComponent(c.title)}`} className="btn btn-warm !min-h-10 text-sm">Record for this request</Link>
                    {user?.id === c.buyer_id && <a href={`/api/dataset/${c.id}`} className="btn btn-ghost !min-h-10 text-sm">Download dataset</a>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <aside className="md:sticky md:top-20 md:self-start">
        <form action={postCall} className="card grid gap-4 p-5">
          <h2 className="text-xl">Post a request</h2>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div>
            <label className="label" htmlFor="title">What you need</label>
            <input id="title" name="title" className="input" required maxLength={120} placeholder="500 hours of egocentric panel wiring" />
          </div>
          <div>
            <label className="label" htmlFor="weakness">Where your model is weak, optional</label>
            <input id="weakness" name="weakness" className="input" maxLength={200} placeholder="Cable routing success 51%, doors 95%" />
          </div>
          <div>
            <label className="label" htmlFor="description">Requirements</label>
            <textarea id="description" name="description" className="input" rows={2} maxLength={1000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select name="task" aria-label="Task" className="input"><option value="">Task: any</option>{LABELS.task.map((o) => <option key={o}>{o}</option>)}</select>
            <select name="industry" aria-label="Industry" className="input"><option value="">Industry: any</option>{LABELS.industry.map((o) => <option key={o}>{o}</option>)}</select>
            <select name="perspective" aria-label="Camera angle" className="input"><option value="">Camera: any</option>{LABELS.perspective.map((o) => <option key={o}>{o}</option>)}</select>
            <input name="min_seconds" type="number" min={1} inputMode="numeric" className="input" placeholder="Min seconds" aria-label="Minimum clip length in seconds" />
            <input name="environment" className="input col-span-2" maxLength={120} placeholder="Environment, e.g. residential kitchen" aria-label="Environment" />
            <input name="objects" className="input col-span-2" maxLength={200} placeholder="Objects that must be visible" aria-label="Required objects" />
            <input name="demos" type="number" min={1} inputMode="numeric" className="input" placeholder="Number of demos" aria-label="Number of demos wanted" />
            <input name="min_people" type="number" min={1} inputMode="numeric" className="input" placeholder="Min different people" aria-label="Minimum number of different people" />
            <div>
              <label className="label" htmlFor="hours">Hours wanted</label>
              <input id="hours" name="hours" type="number" min={1} inputMode="numeric" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="rate">USD per hour</label>
              <input id="rate" name="rate" type="number" min={1} inputMode="numeric" className="input" required />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="wants_failures" className="mt-1" /> Only failure and recovery clips</label>
          {user ? <button className="btn">Post bounty</button> : <Link href="/login" className="btn">Sign in to post</Link>}
        </form>
      </aside>
    </main>
  )
}
