import Link from 'next/link'
import { sql, getUser, getMarket, priceOf } from '@/lib/server'
import { LABELS, tier, taskPhoto } from '@/lib/score'

type Search = { q?: string; task?: string; industry?: string; perspective?: string; min?: string; verified?: string; failures?: string }

const top = (xs: string[], n = 3) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)

export default async function Buy({ searchParams }: { searchParams: Promise<Search> }) {
  const f = await searchParams
  const min = Math.max(2, parseInt(f.min ?? '') || 2) // below 2 is rejected, never listed
  const user = await getUser()
  // ponytail: filter in JS. Move to SQL where-clauses past a few thousand listings.
  const [all, market, history] = await Promise.all([
    sql`select u.id, u.title, u.thumb, u.labels, u.quality_score, u.minutes, u.ask, u.description, u.video_url, u.golden,
        s.trade, s.years, s.verified from uploads u join users s on s.id = u.seller_id
      where u.status = 'scored' and u.quality_score >= ${min} and u.withdrawn_at is null order by u.video_url is null, u.created_at desc`,
    getMarket(),
    user ? sql`select kind, data from events where actor_id = ${user.id} and kind in ('accepted', 'passed')` : [],
  ])
  const q = f.q?.toLowerCase().trim()
  const rows = all.filter((r) => {
    const l = r.labels ?? {}
    return (!f.task || l.task === f.task) && (!f.industry || l.industry === f.industry) && (!f.perspective || l.perspective === f.perspective) && (!f.verified || r.verified) && (!f.failures || /^Failed/.test(l.outcome ?? '')) &&
      (!q || `${r.title} ${r.description} ${r.trade} ${(l.tools ?? []).join(' ')}`.toLowerCase().includes(q))
  })

  // This buyer's acceptance profile, built from their own trail of accepts and passes.
  // ponytail: a rule (same task, score at or above their lowest accept). Learn a ranker once buyers have real history.
  const yes = history.filter((e) => e.kind === 'accepted'), no = history.filter((e) => e.kind === 'passed')
  const tasks = new Set(yes.map((e) => e.data?.labels?.task).filter(Boolean))
  const floor = Math.min(...yes.map((e) => e.data?.score ?? 5))
  const fits = (r: any) => tasks.has(r.labels?.task) && r.quality_score >= floor

  const select = (name: 'task' | 'industry' | 'perspective', label: string) => (
    <select name={name} aria-label={label} defaultValue={f[name] ?? ''} className="input">
      <option value="">{label}: any</option>
      {LABELS[name].map((o) => <option key={o}>{o}</option>)}
    </select>
  )

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-3xl md:text-5xl">Marketplace</h1>
        <p className="muted mt-2 text-sm">Real trade work, open to every lab. Each clip carries its evidence trail. {rows.length} of {all.length} listings.</p>
      </div>

      {history.length > 0 && (
        <section className="card space-y-1 p-5 text-sm">
          <p className="label">Your acceptance profile</p>
          <p>{yes.length} accepted, {no.length} passed.{tasks.size > 0 && ` You take ${[...tasks].join(', ')} at score ${floor} and up.`}</p>
          {yes.length > 0 && <p className="muted">You accept for: {top(yes.flatMap((e) => e.data?.reasons ?? [])).join(', ') || 'no reasons given yet'}.</p>}
          {no.length > 0 && <p className="muted">You pass for: {top(no.flatMap((e) => e.data?.reasons ?? [])).join(', ')}.</p>}
          <p className="muted text-xs">Only you see this. Listings that match are marked below.</p>
        </section>
      )}

      {/* one row of filters, toggles as pills underneath */}
      <form className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_repeat(4,1fr)_auto]">
          <input name="q" defaultValue={f.q} placeholder="Search tool, task, trade" aria-label="Search" className="input col-span-2 md:col-span-1" />
          {select('task', 'Task')}
          {select('industry', 'Industry')}
          {select('perspective', 'View')}
          <select name="min" aria-label="Minimum score" defaultValue={f.min ?? ''} className="input">
            <option value="">Score: any</option>
            {[3, 4, 5].map((n) => <option key={n} value={n}>Score {n}+</option>)}
          </select>
          <button className="btn col-span-2 md:col-span-1">Filter</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[['verified', 'Verified sellers'], ['failures', 'Failure cases']].map(([name, text]) => (
            <label key={name} className="chip cursor-pointer !px-3 !py-1.5 !text-sm has-[:checked]:bg-paper has-[:checked]:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate">
              <input type="checkbox" name={name} defaultChecked={!!f[name as 'verified' | 'failures']} className="sr-only" />{text}
            </label>
          ))}
          <Link href="/buy" className="muted ml-auto text-sm underline underline-offset-4">Clear</Link>
        </div>
      </form>

      {!rows.length && <p className="muted text-sm">No listings match. Clear a filter, or post an open call so sellers film it.</p>}
      {/* An irregular grid: every sixth tile is large, the fourth and fifth are wide. Photo, name, price, nothing else. */}
      <ul className="grid auto-rows-[11rem] grid-flow-dense grid-cols-2 gap-1.5 md:auto-rows-[13rem] md:grid-cols-4">
        {rows.map((r, i) => {
          const photo = r.thumb ?? taskPhoto(r.labels?.task)
          const big = i % 6 === 0
          const shape = big ? 'col-span-2 row-span-2' : i % 6 === 3 || i % 6 === 4 ? 'col-span-2' : ''
          return (
            <li key={r.id} className={shape}>
              <Link href={`/buy/${r.id}`} className="group relative block h-full overflow-hidden rounded-xl bg-white/[.04]">
                {photo ? <img src={photo} alt="" loading="lazy" className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${r.thumb ? '' : 'photo'}`} /> : <div className="streaks h-full" />}
                <div className="absolute inset-0 bg-linear-to-t from-ink/90 via-ink/15 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="flex flex-wrap gap-1.5">
                    {r.golden && <span className="chip chip-warm">Golden</span>}
                    {fits(r) && <span className="chip bg-emerald-500/25 text-emerald-200">Fits you</span>}
                  </p>
                  <h2 className={`mt-2 font-medium uppercase leading-tight tracking-wide ${big ? 'text-xl md:text-2xl' : 'text-sm md:text-base'}`}>{r.title}</h2>
                  <p className="mt-1 text-sm tabular-nums text-paper/70">${priceOf(r, market).toLocaleString('en-US')}<span className="ml-3">{r.quality_score}/5</span><span className="ml-3">{r.minutes >= 60 ? `${Math.round(r.minutes / 60)} h` : `${Math.max(1, Math.round(r.minutes))} min`}</span></p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
