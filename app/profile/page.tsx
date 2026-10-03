import Link from 'next/link'
import { sql, requireUser } from '@/lib/server'
import { SELLER_SHARE, tier, money } from '@/lib/score'

const usd = (n: number) => `$${money(n)}`
const DAY = 86_400_000
const day = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** One bar per day for the last 30. An empty day is a faint stub, so the chart still reads with no sales yet. */
function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div>
      <div className="flex h-40 items-end gap-[3px] md:h-52" aria-hidden>
        {values.map((v, i) => (
          <div key={i} title={v ? usd(v) : undefined} className={`flex-1 rounded-[2px] ${v ? 'bg-flame' : 'bg-white/[.08]'}`} style={{ height: `${v ? Math.max(8, (v / max) * 100) : 3}%` }} />
        ))}
      </div>
      <p className="muted mt-2 flex justify-between text-[11px]"><span>30 days ago</span><span>Today</span></p>
    </div>
  )
}

export default async function Profile() {
  const user = await requireUser()
  const seller = user.role === 'seller'
  // every sale that touches this account, with what was sold and who is on the other side
  const sales = seller
    ? await sql`select p.price, coalesce(p.fee, 0) as fee, coalesce(p.bonus, 0) as bonus, p.created_at, u.title, u.minutes, u.quality_score, coalesce(u.labels->>'task', 'Other') as task, coalesce(b.org, b.name) as who
        from purchases p join uploads u on u.id = p.upload_id join users b on b.id = p.buyer_id where u.seller_id = ${user.id} order by p.created_at desc`
    : await sql`select p.price, 0 as fee, 0 as bonus, p.created_at, u.title, u.minutes, u.quality_score, coalesce(u.labels->>'task', 'Other') as task, s.name as who
        from purchases p join uploads u on u.id = p.upload_id join users s on s.id = u.seller_id where p.buyer_id = ${user.id} order by p.created_at desc`
  // a seller's line is their share of the data price plus any result bonus, a buyer's is what they paid
  const amount = (s: Record<string, any>) => (seller ? (s.price - s.fee) * SELLER_SHARE + s.bonus : s.price)
  const now = Date.now()
  const days = Array.from({ length: 30 }, (_, i) => sales.filter((s) => Math.floor((now - +new Date(s.created_at)) / DAY) === 29 - i).reduce((a, s) => a + amount(s), 0))
  const month = days.reduce((a, b) => a + b, 0), total = sales.reduce((a, s) => a + amount(s), 0)
  const recent = sales.filter((s) => now - +new Date(s.created_at) < 30 * DAY).length
  const by = (f: (s: Record<string, any>) => number) => Object.entries(sales.reduce<Record<string, number>>((a, s) => ((a[s.task] = (a[s.task] ?? 0) + f(s)), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const hours = sales.reduce((a, s) => a + s.minutes, 0) / 60
  const quality = sales.length ? sales.reduce((a, s) => a + s.quality_score, 0) / sales.length : 0
  const split = seller ? by(amount) : by((s) => s.minutes / 60)
  const top = Math.max(...split.map(([, v]) => v), 1)

  const [clips] = seller ? await sql`select count(*) filter (where status = 'scored' and quality_score >= 2 and withdrawn_at is null and duplicate_of is null)::int as listed,
      count(*) filter (where golden)::int as golden, coalesce(avg(quality_score) filter (where status = 'scored' and duplicate_of is null), 0)::float as avg from uploads where seller_id = ${user.id}` : [null]
  const tiles: [string, string][] = seller
    ? [['Clips on the market', String(clips!.listed)], ['Golden clips', String(clips!.golden)], ['Average quality', clips!.avg ? `${clips!.avg.toFixed(1)}/5` : '-'], ['Licences sold', String(sales.length)]]
    : [['Clips licensed', String(sales.length)], ['Hours of data', hours.toFixed(1)], ['Average quality', quality ? `${quality.toFixed(1)}/5` : '-'], ['Trades covered', String(new Set(sales.map((s) => s.task)).size)]]
  const initials = user.name.split(/\s+/).map((w: string) => w.replace(/\W/g, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* who this is */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-16 w-16 flex-none place-items-center rounded-box bg-flame text-2xl font-semibold text-ink md:h-20 md:w-20 md:text-3xl">{initials}</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl md:text-5xl">{user.name}</h1>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip chip-warm">{seller ? 'Seller' : 'Buyer'}</span>
            {seller ? [user.trade || 'No trade set', `${user.years || 0} years`, tier(user.years).name, user.credential].filter(Boolean).map((x) => <span key={x} className="chip">{x}</span>) : <span className="chip">{user.org || user.email}</span>}
          </p>
        </div>
        <Link href={seller ? '/sell' : '/buy'} className="btn btn-warm">{seller ? 'Add data' : 'Find data'}</Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([k, v], i) => (
          <div key={k} className={`card p-5 ${i === 0 ? 'card-warm' : ''}`}>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">{v}</dd>
            <dt className="muted mt-1 text-sm">{k}</dt>
          </div>
        ))}
      </dl>

      {/* the money: two headline numbers beside the chart */}
      <section className="card grid gap-6 p-5 md:grid-cols-[14rem_1fr] md:gap-10 md:p-8">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-1 md:content-between">
          <div>
            <dt className="label">{seller ? 'Earned this month' : 'Spent this month'}</dt>
            <dd className="text-4xl font-semibold tracking-tight tabular-nums text-flame md:text-6xl">{usd(month)}</dd>
            <dd className="muted mt-1 text-xs">{recent} {recent === 1 ? 'licence' : 'licences'}</dd>
          </div>
          <div>
            <dt className="label">All time</dt>
            <dd className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">{usd(total)}</dd>
            <dd className="muted mt-1 text-xs">{sales.length} {sales.length === 1 ? 'licence' : 'licences'}{seller ? '' : `, ${hours.toFixed(1)} hours`}</dd>
          </div>
        </dl>
        <Bars values={days} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5 md:p-6">
          <h2 className="text-xl font-semibold">{seller ? 'Earnings by task' : 'Hours by task'}</h2>
          {split.length ? (
            <ul className="mt-4 space-y-4">
              {split.map(([k, v]) => (
                <li key={k}>
                  <div className="flex justify-between text-sm"><span>{k}</span><span className="tabular-nums">{seller ? usd(v) : `${v.toFixed(1)} h`}</span></div>
                  <div className="bar mt-1.5"><i style={{ width: `${(v / top) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted mt-3 text-sm">{seller ? 'No sales yet. Your first licence shows up here the moment it sells.' : 'Nothing licensed yet. What you buy is broken down by task here.'}</p>}
        </section>
        <section className="card p-5 md:p-6">
          <h2 className="text-xl font-semibold">{seller ? 'Recent sales' : 'Recent purchases'}</h2>
          {sales.length ? (
            <ul className="mt-2 divide-y divide-white/[.07]">
              {sales.slice(0, 6).map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.title || 'Untitled clip'}</p>
                    <p className="muted text-xs">{day(s.created_at)}, {s.who}</p>
                  </div>
                  <span className="flex-none text-sm font-medium tabular-nums">{seller ? '+' : ''}{usd(amount(s))}</span>
                </li>
              ))}
            </ul>
          ) : <p className="muted mt-3 text-sm">Nothing yet.</p>}
        </section>
      </div>
      <p className="muted text-xs">Demo: no money moves. Amounts are what the sales recorded on your account would pay.</p>
    </main>
  )
}
