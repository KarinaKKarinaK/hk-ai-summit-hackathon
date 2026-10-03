import Link from 'next/link'
import { sql, getUser } from '@/lib/server'
import { LABELS } from '@/lib/score'
import { postCall } from '../actions'

export default async function Calls({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const user = await getUser()
  const rows = await sql`select c.*, coalesce(b.org, b.name) as buyer, (select count(*)::int from purchases p where p.call_id = c.id) as clips,
      (select count(distinct u.seller_id)::int from purchases p join uploads u on u.id = p.upload_id where p.call_id = c.id) as people
    from calls c join users b on b.id = c.buyer_id order by c.created_at desc`

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1.5fr_1fr]">
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
                <div className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <p className="muted text-xs">{c.buyer}</p>
                    <h2 className="mt-1 text-xl font-semibold leading-snug">{c.title}</h2>
                    {c.description && <p className="muted mt-2 text-sm">{c.description}</p>}
                  </div>
                  <div className="card-warm flex-none rounded-2xl px-4 py-3 text-center">
                    <p className="text-2xl font-light tabular-nums">${c.rate}</p>
                    <p className="text-[11px] text-paper/70">per hour</p>
                  </div>
                </div>
                {c.weakness && <p className="mx-5 mb-4 rounded-xl bg-white/[.05] px-3 py-2 text-sm"><span className="muted">Model gap: </span>{c.weakness}</p>}
                {/* the numbers, one per cell */}
                <dl className="mx-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    [`${c.clips}${c.demos ? ` / ${c.demos}` : ''}`, 'demos'],
                    [`${c.people}${c.min_people ? ` / ${c.min_people}` : ''}`, 'people'],
                    [`${done.toFixed(done ? 1 : 0)} / ${Math.round(total)} h`, 'collected'],
                    [`$${Math.round(total * c.rate).toLocaleString('en-US')}`, 'budget'],
                  ].map(([v, k]) => (
                    <div key={k} className="rounded-xl bg-white/[.05] px-3 py-2.5">
                      <dt className="text-base font-medium tabular-nums">{v}</dt>
                      <dd className="muted text-[11px] uppercase tracking-wider">{k}</dd>
                    </div>
                  ))}
                </dl>
                <div className="space-y-4 p-5">
                  <div className="bar"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                  <p className="flex flex-wrap items-center gap-1.5">
                    {[c.task, c.industry].filter(Boolean).map((x: string) => <span key={x} className="chip chip-warm">{x}</span>)}
                    {spec.map((s) => <span key={s as string} className="chip">{s}</span>)}
                    {c.wants_failures && <span className="chip">Failure and recovery wanted</span>}
                    {c.forward && <span className="chip chip-slate">Forward contract{c.due ? `, due ${new Date(c.due).toISOString().slice(0, 10)}` : ''}</span>}
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
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="forward" className="mt-1" /> Forward contract: I commit to buy every matching clip at this rate until filled</label>
          <div>
            <label className="label" htmlFor="due">Deliver by, optional</label>
            <input id="due" name="due" type="date" className="input" />
          </div>
          {user ? <button className="btn">Post bounty</button> : <Link href="/login" className="btn">Sign in to post</Link>}
        </form>
      </aside>
    </main>
  )
}
