import Link from 'next/link'
import { sql, requireUser } from '@/lib/server'
import { SELLER_SHARE, tier } from '@/lib/score'

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const DAY = 86_400_000

/** Thin glowing bars, one per day. An empty day is a faint stub, so the chart still reads with no sales yet. */
function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-48 items-end gap-[3px] md:h-56" aria-hidden>
      {values.map((v, i) => (
        <div key={i} className={`flex-1 rounded-full ${v ? 'bg-emerald-400 shadow-[0_0_12px_rgb(52_211_153/0.6)]' : 'bg-emerald-400/15'}`} style={{ height: `${v ? Math.max(12, (v / max) * 100) : 6}%` }} />
      ))}
    </div>
  )
}

/** The report card: chart on top, two headline numbers, then a breakdown list, on a warm fade. */
function Report({ title, days, heads, rows, empty }: { title: string; days: number[]; heads: [string, string, string][]; rows: [string, string][]; empty: string }) {
  return (
    <section className="overflow-hidden rounded-box bg-linear-to-b from-[#0b0705] from-50% via-oxblood to-rust p-6 md:p-8">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="muted mb-5 mt-1 text-xs">Last 30 days, one bar per day</p>
      <Bars values={days} />
      <dl className="mt-8 grid grid-cols-2 gap-6">
        {heads.map(([k, v, note]) => (
          <div key={k}>
            <dt className="text-sm text-paper/70">{k}</dt>
            <dd className="mt-1 font-mono text-4xl font-semibold tracking-tight md:text-5xl">{v}</dd>
            <dd className="mt-1 text-xs text-emerald-300">{note}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-8 divide-y divide-paper/15">
        {rows.length ? rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between py-3"><span className="text-paper/80">{k}</span><span className="font-mono text-lg">{v}</span></li>
        )) : <li className="py-3 text-sm text-paper/70">{empty}</li>}
      </ul>
    </section>
  )
}

export default async function Profile() {
  const user = await requireUser()
  const seller = user.role === 'seller'
  // every sale that touches this account, with what was sold
  const sales = seller
    ? await sql`select p.price, coalesce(p.fee, 0) as fee, coalesce(p.bonus, 0) as bonus, p.created_at, u.minutes, u.quality_score, coalesce(u.labels->>'task', 'Other') as task
        from purchases p join uploads u on u.id = p.upload_id where u.seller_id = ${user.id}`
    : await sql`select p.price, 0 as fee, 0 as bonus, p.created_at, u.minutes, u.quality_score, coalesce(u.labels->>'task', 'Other') as task
        from purchases p join uploads u on u.id = p.upload_id where p.buyer_id = ${user.id}`
  // a seller's line is their share of the data price plus any result bonus, a buyer's is what they paid
  const amount = (s: Record<string, any>) => (seller ? (s.price - s.fee) * SELLER_SHARE + s.bonus : s.price)
  const now = Date.now()
  const days = Array.from({ length: 30 }, (_, i) => sales.filter((s) => Math.floor((now - +new Date(s.created_at)) / DAY) === 29 - i).reduce((a, s) => a + amount(s), 0))
  const month = days.reduce((a, b) => a + b, 0), total = sales.reduce((a, s) => a + amount(s), 0)
  const by = (f: (s: Record<string, any>) => number) => Object.entries(sales.reduce<Record<string, number>>((a, s) => ((a[s.task] = (a[s.task] ?? 0) + f(s)), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const hours = sales.reduce((a, s) => a + s.minutes, 0) / 60
  const quality = sales.length ? sales.reduce((a, s) => a + s.quality_score, 0) / sales.length : 0

  const [clips] = seller ? await sql`select count(*) filter (where status = 'scored' and quality_score >= 2 and withdrawn_at is null and duplicate_of is null)::int as listed,
      count(*) filter (where golden)::int as golden, coalesce(avg(quality_score) filter (where status = 'scored' and duplicate_of is null), 0)::float as avg from uploads where seller_id = ${user.id}` : [null]
  const tiles: [string, string][] = seller
    ? [['Clips on the market', String(clips!.listed)], ['Golden clips', String(clips!.golden)], ['Average quality', clips!.avg ? `${clips!.avg.toFixed(1)}/5` : '-'], ['Licences sold', String(sales.length)]]
    : [['Clips licensed', String(sales.length)], ['Hours of data', hours.toFixed(1)], ['Average quality', quality ? `${quality.toFixed(1)}/5` : '-'], ['Trades covered', String(new Set(sales.map((s) => s.task)).size)]]

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">{seller ? 'Seller' : 'Buyer'}</p>
          <h1 className="text-3xl md:text-5xl">{user.name}</h1>
          <p className="muted mt-2 text-sm">{seller ? `${user.trade || 'No trade set'}, ${user.years || 0} years, ${tier(user.years).name}` : user.org || user.email}</p>
        </div>
        <Link href={seller ? '/sell' : '/buy'} className="btn btn-warm">{seller ? 'Add data' : 'Find data'}</Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([k, v], i) => (
          <div key={k} className={`card p-5 ${i === 0 ? 'card-warm' : ''}`}>
            <dd className="text-3xl font-semibold tracking-tight tabular-nums">{v}</dd>
            <dt className="muted mt-1 text-sm">{k}</dt>
          </div>
        ))}
      </dl>

      {seller ? (
        <Report title="Earnings" days={days} heads={[['This month', usd(month), `${sales.filter((s) => now - +new Date(s.created_at) < 30 * DAY).length} licences`], ['All time', usd(total), `${sales.length} licences`]]}
          rows={by(amount).map(([k, v]) => [k, usd(v)])} empty="No sales yet. Your first licence shows up here the moment it sells." />
      ) : (
        <Report title="Data acquired" days={days} heads={[['Spent this month', usd(month), `${hours.toFixed(1)} hours in total`], ['Spent all time', usd(total), quality ? `average quality ${quality.toFixed(1)}/5` : 'no clips yet']]}
          rows={by((s) => s.minutes / 60).map(([k, v]) => [k, `${v.toFixed(1)} h`])} empty="Nothing licensed yet. What you buy is broken down by trade here." />
      )}
      <p className="muted text-xs">Demo: no money moves. Amounts are what the sales recorded on your account would pay.</p>
    </main>
  )
}
