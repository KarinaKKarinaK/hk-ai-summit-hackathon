'use client'

import { useState } from 'react'
import { listPrice, SELLER_SHARE } from '@/lib/score'

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const TIERS = [['Under 3 years', 0], ['3+ years', 3], ['10+ years', 10]] as const

/** What recordings earn at today's market rates. Arithmetic only, and the sum is shown. */
export default function Calculator({ rates }: { rates: Record<string, number> }) {
  const tasks = Object.keys(rates)
  const [task, setTask] = useState(tasks[0])
  const [hours, setHours] = useState(2)
  const [sales, setSales] = useState(1)
  const [years, setYears] = useState(0)
  const perHour = listPrice(rates[task], 60, 4, years) * SELLER_SHARE // your share of one hour, sold once, at par quality
  const monthly = (perHour * hours * sales * 52) / 12

  return (
    <div className="card overflow-hidden">
      <div className="card-warm px-6 py-7 text-center md:py-12" aria-live="polite">
        <p className="text-sm text-paper/70">You could earn about</p>
        <p className="mt-1 text-5xl font-light tracking-tight tabular-nums md:text-8xl">{usd(monthly)}<span className="text-2xl text-paper/60 md:text-4xl"> a month</span></p>
        <p className="mt-2 text-paper/80">{usd(monthly * 12)} a year, on top of your normal pay</p>
      </div>
      <div className="grid gap-6 p-6 md:grid-cols-3">
        <div>
          <label className="label" htmlFor="calc-task">What you do</label>
          <select id="calc-task" className="input" value={task} onChange={(e) => setTask(e.target.value)}>
            {tasks.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <p className="label mt-4">How long you have done it</p>
          <p className="flex flex-wrap gap-1.5">
            {TIERS.map(([name, y]) => (
              <button key={name} type="button" aria-pressed={years === y} onClick={() => setYears(y)} className={`chip ${years === y ? 'chip-warm' : ''}`}>{name}</button>
            ))}
          </p>
        </div>
        <label className="block">
          <span className="label">Hours you record each week</span>
          <span className="block text-3xl font-light tabular-nums">{hours} {hours === 1 ? 'hour' : 'hours'}</span>
          <input type="range" min={1} max={20} value={hours} onChange={(e) => setHours(+e.target.value)} className="mt-2 w-full accent-[#8e9a9b]" />
        </label>
        <label className="block">
          <span className="label">Companies that buy each recording</span>
          <span className="block text-3xl font-light tabular-nums">{sales} {sales === 1 ? 'company' : 'companies'}</span>
          <input type="range" min={1} max={10} value={sales} onChange={(e) => setSales(+e.target.value)} className="mt-2 w-full accent-[#8e9a9b]" />
        </label>
      </div>
      <p className="muted px-6 pb-6 text-xs">How it adds up: you get {usd(perHour)} for each hour of {task.toLowerCase()} footage, each time a company buys it. That is your {SELLER_SHARE * 100}% share at today&apos;s demo rate. An example, not a promise.</p>
    </div>
  )
}
