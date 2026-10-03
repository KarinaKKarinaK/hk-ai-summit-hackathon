import { NextResponse } from 'next/server'
import { getMarket, guildIndex } from '@/lib/server'
import { signal } from '@/lib/score'

// The Guild Index: an open reference price for robot training data, one rate per trade.
export async function GET() {
  const market = await getMarket()
  return NextResponse.json(
    {
      name: 'Guild Index',
      as_of: new Date().toISOString(),
      unit: 'USD per hour of par-quality (score 4) footage',
      index: guildIndex(market),
      methodology: 'Per trade: volume-weighted bid, scaled 0.6x to 1.4x by hours wanted against hours listed, pulled 30% toward the last sale (clamped to 0.5x..2x). Index: demand-weighted average across trades with live bids.',
      trades: Object.entries(market).map(([task, m]) => ({ task, rate: m.rate, top_bid: m.topBid || null, last_sale: m.last, hours_wanted: m.demand, hours_listed: +m.supply.toFixed(2), listings: m.listings, signal: signal(m) })),
    },
    { headers: { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' } },
  )
}
