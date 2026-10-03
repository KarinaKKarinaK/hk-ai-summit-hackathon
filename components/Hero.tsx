'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

type Stats = { book: number; hours: number; markets: number } | null

/**
 * Landing hero: the video fills the whole top of the page and leans a little toward the pointer,
 * and the three live numbers count up once.
 */
export default function Hero({ stats }: { stats: Stats }) {
  const video = useRef<HTMLVideoElement>(null)
  const [t, setT] = useState(0) // 0 to 1, how far the count-up has run

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setT(1)
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 1400)
      setT(1 - (1 - p) ** 3)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !video.current) return
      video.current.style.transform = `scale(1.06) translate(${(0.5 - e.clientX / innerWidth) * 22}px, ${(0.5 - e.clientY / innerHeight) * 14}px)`
    }
    addEventListener('pointermove', move)
    return () => { cancelAnimationFrame(raf); removeEventListener('pointermove', move) }
  }, [])

  const n = (x: number) => Math.round(x * t).toLocaleString('en-US')
  return (
    <section className="relative isolate overflow-hidden">
      <video ref={video} autoPlay muted loop playsInline poster="/hero.jpg" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-[1.06] object-cover object-[60%_center] transition-transform duration-700 ease-out max-md:h-[52%]">
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      {/* shade only where the words are: the foot on a phone, the left on a wide screen */}
      <div className="absolute inset-0 -z-10 bg-linear-to-t from-ink from-48% via-ink/70 via-62% to-transparent md:bg-linear-to-r md:from-ink/95 md:from-5% md:via-ink/45 md:via-42% md:to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-linear-to-t from-ink to-transparent" />
      <div className="rise mx-auto grid min-h-[78dvh] max-w-6xl content-end gap-6 px-4 pb-6 pt-44 md:min-h-[88dvh] md:pb-16 md:pt-28">
        <div className="max-w-xl">
          <p className="chip chip-flame">Task data marketplace</p>
          <h1 className="mt-4 text-5xl md:text-7xl">The open market for task data.</h1>
          <p className="mt-5 max-w-md text-lg text-paper/85">Companies post the tasks their AI needs to learn. People record themselves doing them. Every clip is checked, labelled and licensed.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/buy" className="btn">Browse data</Link>
            <Link href="/sell" className="btn btn-warm">Start earning</Link>
          </div>
        </div>
        {stats && (
          <dl className="grid max-w-lg grid-cols-3 gap-4 border-t border-white/15 pt-5 tabular-nums">
            {[[`$${n(stats.book)}`, 'in open requests'], [`${n(stats.hours)} h`, 'footage listed'], [n(stats.markets), 'live markets']].map(([v, l]) => (
              <div key={l}>
                <dt className="text-2xl font-medium tracking-tight md:text-4xl">{v}</dt>
                <dd className="mt-0.5 text-xs text-paper/70 md:text-sm">{l}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}
