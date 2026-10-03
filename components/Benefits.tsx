'use client'

import { useState } from 'react'
import Link from 'next/link'
import Dither from './Dither'

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

// one poster tone and one height per card, so the row is not a row
const LOOK = [['flame', 'lg:mt-8'], ['coal', ''], ['flow', 'lg:mt-14'], ['coal', 'lg:mt-4']] as const

/** Two buttons, two lists: what you get as a seller and as a buyer. */
export default function Benefits() {
  const [side, setSide] = useState<keyof typeof SIDES>('sell')
  const s = SIDES[side]
  return (
    <div>
      <div role="group" aria-label="Who are you" className="mx-auto grid max-w-md grid-cols-2 rounded-full bg-white/[.07] p-1.5">
        {(Object.keys(SIDES) as (keyof typeof SIDES)[]).map((k) => (
          <button key={k} aria-pressed={side === k} onClick={() => setSide(k)} className={`rounded-full px-5 py-3 font-medium transition-colors duration-300 ${side === k ? 'bg-linear-to-br from-flame to-pink text-ink shadow-[0_8px_22px_-8px_#ee7340]' : 'muted'}`}>{SIDES[k].name}</button>
        ))}
      </div>
      {/* keyed by side so the cards animate in again on every switch */}
      <ul key={side} className="rise mt-6 grid grid-cols-2 items-start gap-3 md:gap-5 lg:grid-cols-4">
        {s.items.map(([hook, line], i) => {
          const [tone, drop] = LOOK[i]
          return (
            <li key={hook} className={`tile flex min-h-36 flex-col justify-end p-4 md:min-h-56 md:p-6 ${drop} ${i % 2 ? 'max-lg:mt-6' : ''} ${tone === 'flame' ? 'tile-flame text-ink' : tone === 'flow' ? 'on-flow' : 'tile-coal'}`} style={{ animationDelay: `${i * 70}ms` }}>
              <Dither tone={tone} seed={i * 1.9 + (side === 'sell' ? 3 : 6)} />
              <p className="text-2xl font-semibold tracking-tight md:text-4xl">{hook}</p>
              <p className="mt-1.5 text-xs opacity-90 md:mt-2 md:text-sm">{line}</p>
            </li>
          )
        })}
      </ul>
      <div className="mt-8 text-center"><Link href={s.cta[1]} className="btn">{s.cta[0]}</Link></div>
    </div>
  )
}
