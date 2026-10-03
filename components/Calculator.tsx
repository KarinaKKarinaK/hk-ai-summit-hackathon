'use client'

import { useState } from 'react'
import { listPrice, SELLER_SHARE } from '@/lib/score'

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const TIERS = [['New', 0], ['3+ years', 3], ['10+ years', 10]] as const

/** What filmed work earns at today's market rates. Arithmetic only, and the sum is shown. */
export default function Calculator({ rates }: { rates: Record<string, number> }) {
  const tasks = Object.keys(rates)
  const [task, setTask] = useState(tasks[0])
  const [hours, setHours] = useState(2)
  const [sales, setSales] = useState(2)
  const [years, setYears] = useState(3)
  const perHour = listPrice(rates[task], 60, 4, years) // one hour at par quality
  const yearly = perHour * hours * sales * 52 * SELLER_SHARE

  return (
    <div className="card overflow-hidden">
      <div className="card-warm px-6 py-10 text-center md:py-14" aria-live="polite">
        <p className="text-sm text-paper/70">You would earn about</p>
        <p className="mt-2 text-6xl font-light tracking-tight tabular-nums md:text-8xl">{usd(yearly)}</p>
        <p className="mt-2 text-paper/80">a year in royalties, or {usd(yearly / 12)} a month</p>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-3">
        <label className="block">
          <span className="label">Your trade</span>
          <select className="input" value={task} onChange={(e) => setTask(e.target.value)}>
            {tasks.map((t) => <option key={t} value={t}>{t}, ${rates[t].toFixed(0)}/h</option>)}
          </select>
          <span className="mt-3 flex gap-1.5">
            {TIERS.map(([name, y]) => (
              <button key={name} type="button" aria-pressed={years === y} onClick={() => setYears(y)} className={`chip ${years === y ? 'chip-warm' : ''}`}>{name}</button>
            ))}
          </span>
        </label>
        <label className="block">
          <span className="label">Hours you film a week</span>
          <span className="block text-3xl font-light tabular-nums">{hours} h</span>
          <input type="range" min={1} max={20} value={hours} onChange={(e) => setHours(+e.target.value)} className="mt-2 w-full accent-[#8e9a9b]" />
        </label>
        <label className="block">
          <span className="label">Labs that license each hour</span>
          <span className="block text-3xl font-light tabular-nums">{sales}</span>
          <input type="range" min={1} max={10} value={sales} onChange={(e) => setSales(+e.target.value)} className="mt-2 w-full accent-[#8e9a9b]" />
        </label>
      </div>
      <p className="muted px-6 pb-6 text-xs">{usd(perHour)} per licensed hour x {hours} h x 52 weeks x {sales} labs, and you keep {SELLER_SHARE * 100}%. An illustration at today&apos;s demo rates, not a forecast.</p>
    </div>
  )
}
