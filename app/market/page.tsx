import Link from 'next/link'
import { getMarket, guildIndex } from '@/lib/server'
import { signal, BASE_RATE, SELLER_SHARE } from '@/lib/score'

export default async function MarketPage() {
  const market = await getMarket()
  const index = guildIndex(market)
  const rows = Object.entries(market).sort((a, b) => b[1].rate - a[1].rate)
  const top = rows[0][1].rate

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Guild Index</p>
          <h1 className="text-5xl tabular-nums md:text-7xl">${index.toFixed(2)}<span className="muted text-xl"> /h</span></h1>
        </div>
        <a className="btn btn-ghost !min-h-9 text-sm" href="/api/index">Open JSON</a>
      </div>

      {/* phones: one row per trade, rate and a bar */}
      <ul className="space-y-2 md:hidden">
        {rows.map(([task, m]) => (
          <li key={task}>
            <Link href={`/buy?task=${task}`} className={`card block p-4 ${m.demand || m.supply ? '' : 'opacity-50'}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{task}</span>
                <span className="text-2xl font-light tabular-nums">${m.rate.toFixed(0)}<span className="muted text-xs">/h</span></span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-linear-to-r from-flame via-flame to-blush" style={{ width: `${(m.rate / top) * 100}%` }} /></div>
            </Link>
          </li>
        ))}
      </ul>

      {/* desktop: fixed columns, numbers right-aligned so they line up */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full table-fixed text-sm tabular-nums">
          <colgroup><col /><col className="w-36" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-40" /></colgroup>
          <thead>
            <tr className="muted text-xs uppercase tracking-wider">
              <th className="px-6 py-4 text-left font-normal">Trade</th>
              {['Rate', 'Top bid', 'Wanted', 'Listed'].map((h) => <th key={h} className="px-4 py-4 text-right font-normal">{h}</th>)}
              <th className="px-6 py-4 text-right font-normal">Supply</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([task, m]) => (
              <tr key={task} className={`border-t border-white/[.06] transition-colors hover:bg-white/[.03] ${m.demand || m.supply ? '' : 'opacity-45'}`}>
                <td className="px-6 py-4">
                  <Link href={`/buy?task=${task}`} className="font-medium">{task}</Link>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full rounded-full bg-linear-to-r from-flame via-flame to-blush" style={{ width: `${(m.rate / top) * 100}%` }} /></div>
                </td>
                <td className="px-4 py-4 text-right text-xl font-light">${m.rate.toFixed(2)}</td>
                <td className="px-4 py-4 text-right">{m.topBid ? `$${m.topBid.toFixed(0)}` : <span className="muted">-</span>}</td>
                <td className="px-4 py-4 text-right">{m.demand ? `${Math.round(m.demand)} h` : <span className="muted">-</span>}</td>
                <td className="px-4 py-4 text-right">{m.supply ? `${m.supply.toFixed(1)} h` : <span className="muted">-</span>}</td>
                <td className="px-6 py-4 text-right"><span className={`chip ${signal(m) === 'Undersupplied' ? 'chip-warm' : ''}`}>{m.demand || m.supply ? signal(m) : 'No activity'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted max-w-3xl text-xs">Rate per hour of footage = average bid (${BASE_RATE} if nobody has bid), moved 0.6x to 1.4x by hours wanted against hours listed, then pulled 30% toward the last sale. Sellers keep {SELLER_SHARE * 100}%.</p>
    </main>
  )
}
