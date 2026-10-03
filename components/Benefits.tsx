'use client'

import { useState } from 'react'
import Link from 'next/link'

// Each benefit: the short hook, then one line. Kept to four a side.
const SIDES = {
  sell: {
    name: 'I film work', cta: ['Start earning', '/sell'],
    items: [['80%', 'of every sale is yours'], ['Again', 'paid each time a clip is licensed'], ['Yours', 'you keep the footage and can withdraw it'], ['A phone', 'is all the kit you need']],
  },
  buy: {
    name: 'I buy data', cta: ['Browse the marketplace', '/buy'],
    items: [['Exact', 'post a request for what your model is missing'], ['Verified', 'filmed live, with a trail you can audit'], ['Cleared', 'a training licence on every clip'], ['Your way', 'label it yourself, free open source, LLM, or human-checked']],
  },
} as const

/** Two buttons, two lists: what you get as a seller and as a buyer. */
export default function Benefits() {
  const [side, setSide] = useState<keyof typeof SIDES>('sell')
  const s = SIDES[side]
  return (
    <div>
      <div role="group" aria-label="Who are you" className="mx-auto grid max-w-md grid-cols-2 rounded-full bg-white/[.07] p-1.5">
        {(Object.keys(SIDES) as (keyof typeof SIDES)[]).map((k) => (
          <button key={k} aria-pressed={side === k} onClick={() => setSide(k)} className={`rounded-full px-5 py-3 font-medium transition-colors duration-300 ${side === k ? 'bg-linear-to-br from-amber to-rust text-paper shadow-[0_8px_22px_-8px_#6c4724]' : 'muted'}`}>{SIDES[k].name}</button>
        ))}
      </div>
      {/* keyed by side so the cards animate in again on every switch */}
      <ul key={side} className="rise plots stagger mt-8 grid grid-cols-2 gap-5 pb-6 md:gap-8 md:pb-12 lg:grid-cols-[1.3fr_1fr_1.1fr_0.95fr]">
        {s.items.map(([hook, line], i) => (
          <li key={hook} className={`plot plot-check p-4 md:p-6 ${i === 0 ? 'plot-warm' : i === 3 ? 'plot-solid' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`!absolute text-emerald-400 ${i % 2 ? "bottom-[calc(var(--r)-10px)] right-[calc(var(--r)-10px)]" : "right-[calc(var(--r)-10px)] top-[calc(var(--r)-10px)]"}`}><path d="M5 12l5 5L20 7" /></svg>
            <p className={`text-2xl font-semibold tracking-tight md:text-4xl pr-10`}>{hook}</p>
            <p className={`mt-1.5 text-xs text-paper/75 md:mt-2 md:text-sm pr-10`}>{line}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-center"><Link href={s.cta[1]} className="btn">{s.cta[0]}</Link></div>
    </div>
  )
}
