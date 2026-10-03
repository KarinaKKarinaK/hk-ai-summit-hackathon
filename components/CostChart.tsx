'use client'

import { useEffect, useRef, useState } from 'react'
import Dither from './Dither'

// Hours of training data that 1,000 USD buys, from published per-hour collection costs:
// teleoperation 28 to 60 USD/h, raw egocentric video 15 to 22 USD/h. Sources are linked under the chart.
const BUDGET = [
  [17, 'Teleoperation, complex rig', '$60/h'],
  [36, 'Teleoperation, simple rig', '$28/h'],
  [45, 'Human video, high end', '$22/h'],
  [67, 'Human video, low end', '$15/h'],
] as const

/**
 * The case in one chart. Each bar carries its own numbers, grows in when the panel scrolls into view,
 * and can be picked: the big figure then shows how much further the budget goes than the dearest way.
 */
export default function CostChart() {
  const ref = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState(BUDGET.length - 1)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setShown(true), io.disconnect()), { threshold: 0.25 })
    io.observe(ref.current!)
    return () => io.disconnect()
  }, [])

  const times = BUDGET[pick][0] / BUDGET[0][0]
  return (
    <div ref={ref} className="tile tile-bare rounded-[28px] !bg-plum p-5 md:rounded-[40px] md:p-12">
      <Dither tone="plum" seed={5.1} />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_2fr] md:gap-12">
        <div className="flex flex-col">
          <p className="chip chip-flame self-start">Why human video</p>
          <h2 className="mt-4 text-3xl md:text-5xl">More robot data for the <span className="text-flame">same money</span></h2>
          <p className="mt-4 max-w-xs text-sm text-paper/85 md:mt-auto md:text-base">Filming a person costs a third to half as much per hour as teleoperating a robot, and collects 3 to 5 times faster. Pick a bar. Against the dearest rig, the same budget buys:</p>
          <p className="text-dither mt-2 self-start text-7xl font-medium leading-none tracking-tighter tabular-nums md:text-[9rem]" aria-live="polite">{times < 1.05 ? '1' : times.toFixed(1)}x</p>
        </div>
        <div className="grid grid-cols-4 gap-2 md:gap-4">
          {BUDGET.map(([h, name, cost], i) => (
            <button key={name} type="button" aria-pressed={pick === i} onClick={() => setPick(i)} onMouseEnter={() => setPick(i)} onFocus={() => setPick(i)} className="flex flex-col text-left">
              <span className="flex h-56 w-full items-end md:h-[26rem]">
                <span className={`flex w-full flex-col justify-between overflow-hidden rounded-lg p-2 transition-[height,background-color,color] duration-700 ease-out md:rounded-2xl md:p-4 ${pick === i ? 'bg-flame text-ink' : 'bg-white/[.1]'}`} style={{ height: shown ? `${(h / 67) * 100}%` : '0%', transitionDelay: shown ? '0ms' : `${i * 90}ms` }}>
                  <span className="text-xl font-medium leading-none tabular-nums md:text-5xl">{h} h</span>
                  <span className={`text-[11px] tabular-nums md:text-sm ${pick === i ? 'font-medium' : 'text-paper/70'}`}>{cost}</span>
                </span>
              </span>
              <span className={`mt-2 text-[11px] leading-tight md:mt-3 md:text-sm ${pick === i ? '' : 'text-paper/70'}`}>{name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-6 text-xs text-paper/65">
        Hours of training data per $1,000, worked out from published collection costs per hour. Public teleoperated robot data totals about 11,000 hours (Open X-Embodiment), while the largest private collection, 16M+ videos, is shared with nobody.
        Sources: <a className="underline" href="https://dexset.ai/blogs/egocentric-data-collection-robotics/">Dexset</a>, <a className="underline" href="https://truelabel.ai/solutions/egocentric-video-data">truelabel</a>, <a className="underline" href="https://arxiv.org/abs/2606.20521">HumanScale</a>. Reported figures, not verified by us.
      </p>
    </div>
  )
}
