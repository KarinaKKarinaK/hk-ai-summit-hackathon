import Link from 'next/link'
import { getMarket } from '@/lib/server'
import { signal, BASE_RATE, SELLER_SHARE } from '@/lib/score'

export default async function MarketPage() {
  const rows = Object.entries(await getMarket()).sort((a, b) => b[1].rate - a[1].rate)

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-3xl md:text-5xl">Prices</h1>
        <p className="muted mt-2 max-w-2xl text-sm">A live market for robot training data. Buyers bid in open calls, sellers list or set an ask, and the rate for each trade moves with real demand. Nobody sets it behind closed doors.</p>
      </div>

      {/* phones get one card per task, no sideways scrolling */}
      <ul className="grid gap-3 md:hidden">
        {rows.map(([task, m]) => (
          <li key={task}>
            <Link href={`/buy?task=${task}`} className="card flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{task}</p>
                <p className="muted text-xs">{Math.round(m.demand)} h wanted, {m.supply.toFixed(1)} h listed{m.topBid ? `, top bid $${m.topBid.toFixed(0)}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-light tracking-tight">${m.rate.toFixed(0)}<span className="muted text-xs">/h</span></p>
                <span className={`chip ${signal(m) === 'Undersupplied' ? 'chip-slate' : ''}`}>{signal(m)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="label">
            <tr>{['Task', 'Market rate', 'Top bid', 'Last sale', 'Wanted', 'Listed', 'Signal', ''].map((h) => <th key={h} className="p-4 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-tan/15 [&_td]:p-4">
            {rows.map(([task, m]) => {
              const move = m.last && m.prev ? m.last - m.prev : 0
              return (
                <tr key={task}>
                  <td className="font-medium">{task}</td>
                  <td className="text-xl font-light">${m.rate.toFixed(2)}<span className="muted text-xs">/h</span></td>
                  <td>{m.topBid ? `$${m.topBid.toFixed(0)}/h` : <span className="muted">No bids</span>}</td>
                  <td>{m.last ? <>${m.last.toFixed(0)}/h {move !== 0 && <span className={move > 0 ? 'text-emerald-300' : 'text-red-300'}>{move > 0 ? '+' : ''}{move.toFixed(0)}</span>}</> : <span className="muted">None yet</span>}</td>
                  <td>{Math.round(m.demand)} h</td>
                  <td>{m.supply.toFixed(1)} h <span className="muted">({m.listings})</span></td>
                  <td><span className={`chip ${signal(m) === 'Undersupplied' ? 'chip-slate' : ''}`}>{signal(m)}</span></td>
                  <td className="whitespace-nowrap"><Link href="/sell" className="underline underline-offset-4">Sell</Link> <Link href={`/buy?task=${task}`} className="ml-2 underline underline-offset-4">Buy</Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="label">The formula, in full</p>
          <p className="text-sm">Rate = average bid (${BASE_RATE}/h if nobody has bid) x 0.6 to 1.4 depending on hours wanted against hours listed, then pulled 30% toward the last real sale.</p>
          <p className="muted mt-2 text-sm">A clip costs rate x length x score / 4 x the seller&apos;s experience tier.</p>
        </div>
        <div className="card p-5">
          <p className="label">Why it is fair</p>
          <p className="text-sm">Sellers keep {SELLER_SHARE * 100}% of every sale and can set their own ask or sell straight into a bid. One odd trade cannot move a market more than 30%.</p>
        </div>
        <div className="card p-5">
          <p className="label">Why it matters</p>
          <p className="text-sm">When wiring footage is scarce, the price says so and electricians start filming. Supply follows what robots need, not what one company decides to collect.</p>
        </div>
      </section>
    </main>
  )
}
