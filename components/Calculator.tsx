'use client'

import { useState } from 'react'
import { listPrice, tier, SELLER_SHARE } from '@/lib/score'

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/** Unit economics of filmed work at today's market rates. Arithmetic only, shown in full. */
export default function Calculator({ rates }: { rates: Record<string, number> }) {
  const tasks = Object.keys(rates)
  const [task, setTask] = useState(tasks[0])
  const [hours, setHours] = useState(3)
  const [sales, setSales] = useState(3)
  const [years, setYears] = useState(10)
  const perHour = listPrice(rates[task], 60, 4, years) // one hour at par quality
  const gmv = perHour * hours * sales * 52
  const range = (label: string, value: number, set: (n: number) => void, max: number, unit: string) => (
    <label className="block">
      <span className="label">{label}: <span className="text-paper">{value} {unit}</span></span>
      <input type="range" min={1} max={max} value={value} onChange={(e) => set(+e.target.value)} className="w-full accent-[#8e9a9b]" />
    </label>
  )

  return (
    <div className="card grid gap-6 p-5 md:grid-cols-2 md:p-8">
      <div className="space-y-4">
        <label className="block">
          <span className="label">Trade task</span>
          <select className="input" value={task} onChange={(e) => setTask(e.target.value)}>
            {tasks.map((t) => <option key={t} value={t}>{t}, ${rates[t].toFixed(0)}/h today</option>)}
          </select>
        </label>
        {range('Hours filmed per week', hours, setHours, 20, 'h')}
        {range('Buyers who license each hour', sales, setSales, 10, 'x')}
        {range('Years in the trade', years, setYears, 30, `yrs (${tier(years).name}, ${tier(years).mult}x)`)}
      </div>
      <div className="space-y-4" aria-live="polite">
        <div>
          <p className="label">Worker royalty income per year</p>
          <p className="text-5xl font-light tracking-tight md:text-6xl">{usd(gmv * SELLER_SHARE)}</p>
          <p className="muted text-sm">{usd((gmv * SELLER_SHARE) / 12)} a month, on top of the day job</p>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-tan/25 pt-4">
          <div><p className="label">Gross licence value</p><p className="text-2xl font-light">{usd(gmv)}</p></div>
          <div><p className="label">Platform revenue, 20%</p><p className="text-2xl font-light">{usd(gmv * (1 - SELLER_SHARE))}</p></div>
        </div>
        <p className="muted text-xs">{usd(perHour)} per licensed hour x {hours} h x 52 weeks x {sales} buyers. An illustration at today&apos;s demo-market rate, not a forecast. Rates move with demand.</p>
      </div>
    </div>
  )
}
