import Link from 'next/link'
import Calculator from '@/components/Calculator'
import ArmScene from '@/components/ArmScene'
import Benefits from '@/components/Benefits'
import { sql, getMarket } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Hours of training data that 1,000 USD buys, from published per-hour collection costs:
// teleoperation 28 to 60 USD/h, raw egocentric video 15 to 22 USD/h. Sources are linked under the chart.
const BUDGET = [
  [17, 'Teleoperation, complex rig', '$60/h'],
  [36, 'Teleoperation, simple rig', '$28/h'],
  [45, 'Human video, high end', '$22/h'],
  [67, 'Human video, low end', '$15/h'],
] as const

const compare = [
  ['Model', 'Closed pipeline into one robot', 'Open exchange any lab can buy from'],
  ['Ownership', 'Given away for a flat fee', 'Worker keeps it, earns on every licence'],
  ['Price', 'Set by the collector', 'A live market that follows demand'],
  ['Proof', 'Trust the uploader', 'Filmed in-app, live challenge, evidence trail'],
]

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const section = 'mx-auto max-w-6xl px-4 py-8 md:py-14'

export default async function Home() {
  const [stats, market] = await Promise.all([
    sql`select coalesce(sum(minutes), 0)::int / 60 as hours,
      (select coalesce(sum(hours * rate), 0)::int from calls where hours > 0) as book,
      (select count(distinct task)::int from calls where task is not null and hours > 0) as markets
      from uploads where status = 'scored' and quality_score >= 2 and withdrawn_at is null`.then((r) => r[0]).catch(() => null),
    getMarket().catch(() => null),
  ])
  const rates = market && Object.fromEntries(Object.entries(market).sort((a, b) => b[1].rate - a[1].rate).map(([k, m]) => [k, m.rate]))

  return (
    <main>
      {/* Hero video: a welder at work, looping silently, faded into the page on the left and bottom. */}
      <section className="relative isolate overflow-hidden">
        <video autoPlay muted loop playsInline poster="/hero.jpg" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover object-[60%_center] max-md:h-[62%]">
          <source src="/hero.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-ink from-42% via-ink/80 via-58% to-transparent md:bg-linear-to-r md:from-ink md:from-8% md:via-ink/55 md:via-38% md:to-transparent" />
        <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-ink/85 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-linear-to-t from-ink via-ink/80 to-transparent" />
        <div className="rise mx-auto grid min-h-[76dvh] max-w-6xl content-end gap-7 px-4 pb-6 pt-56 md:min-h-[80dvh] md:pb-14 md:pt-28">
          <div className="max-w-xl">
            <h1 className="text-5xl md:text-7xl">The open market for robot training data.</h1>
            <p className="muted mt-5 max-w-md text-lg">Labs request what their models are missing. Anyone with a phone records it and earns on every licence.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/market" className="btn">See live prices</Link>
              <Link href="/sell" className="btn btn-ghost">Start earning</Link>
            </div>
          </div>
          {stats && (
            <dl className="flex flex-wrap gap-x-12 gap-y-4 tabular-nums">
              {[[usd(stats.book), 'open requests'], [`${stats.hours.toLocaleString('en-US')} h`, 'footage listed'], [stats.markets, 'live markets']].map(([n, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-light tracking-tight">{n}</dt>
                  <dd className="muted text-sm">{l}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {/* The case in one chart: a tag, a headline, one big number, and four bars with the last one lit. */}
      <section data-tilt className={section}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_2.2fr] md:gap-12">
          <div className="flex flex-col">
            <p className="chip chip-warm self-start">Why human video</p>
            <h2 className="mt-4 text-3xl md:text-5xl">More robot data for the same money</h2>
            <p className="mt-4 max-w-xs text-sm text-paper/80 md:mt-auto md:text-base">Filming a person costs a third to half as much per hour as teleoperating a robot, and collects 3 to 5 times faster. The same budget buys up to:</p>
            <p className="mt-2 text-7xl font-light leading-none tracking-tighter md:text-[10rem]">4x</p>
          </div>
          <div className="grid grid-cols-4 items-end gap-2 md:gap-5">
            {BUDGET.map(([h, name, cost], i) => {
              const lit = i === BUDGET.length - 1
              return (
                <div key={name} className="flex h-full flex-col">
                  <p className={`text-2xl font-light tabular-nums md:text-5xl ${lit ? '' : 'text-slate'}`}>{h} h</p>
                  <p className="mb-4 mt-1 min-h-10 text-sm leading-tight text-paper/80 max-md:hidden">{name}</p>
                  <div className="mt-2 flex h-40 items-end md:mt-auto md:h-96">
                    <div className={`relative w-full ${lit ? 'bg-linear-to-t from-rust via-tan to-slate' : 'bg-white/[.09]'}`} style={{ height: `${(h / 67) * 100}%` }}>
                      <span className={`absolute bottom-2 left-2 text-xs tabular-nums ${lit ? '' : 'muted'}`}>{cost}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <p className="mt-3 text-xs text-paper/80 md:hidden">Left to right: teleoperation on a complex rig, teleoperation on a simple rig, human video at the high end, human video at the low end.</p>
        <p className="muted mt-4 text-xs">
          Hours of training data per $1,000, worked out from published collection costs per hour. Public teleoperated robot data totals about 11,000 hours (Open X-Embodiment), while the largest private collection, 16M+ videos, is shared with nobody.
          Sources: <a className="underline" href="https://dexset.ai/blogs/egocentric-data-collection-robotics/">Dexset</a>, <a className="underline" href="https://truelabel.ai/solutions/egocentric-video-data">truelabel</a>, <a className="underline" href="https://arxiv.org/abs/2606.20521">HumanScale</a>. Reported figures, not verified by us.
        </p>
      </section>

      <section data-tilt className={section}>
        <h2 className="mb-5 text-center text-3xl md:mb-8 md:text-5xl">What is in it for you</h2>
        <Benefits />
      </section>

      <ArmScene />

      {rates && (
        <section data-tilt className={section}>
          <h2 className="max-w-2xl text-3xl md:text-5xl">Calculate what an hour of your work is worth as data.</h2>
          <p className="muted mb-5 mt-3 max-w-xl md:mb-8">Pick your trade and how much you film. One clip can be licensed by many labs, and you are paid each time.</p>
          <Calculator rates={rates} />
        </section>
      )}

      <section id="mission" className="streaks">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-24">
          <h2 className="max-w-2xl text-4xl md:text-6xl">Robot data should not belong to one company.</h2>
          <p className="mt-6 max-w-lg text-lg text-paper/75">Figure can spend a billion dollars on its own data and shares nothing. We are the open market for everyone else.</p>
        </div>
      </section>

      <section data-tilt className={section}>
        <h2 className="text-3xl md:text-5xl">An exchange, not a pipeline.</h2>
        <dl className="mt-8 text-sm md:text-base">
          <div className="hidden grid-cols-[9rem_1fr_1fr] gap-6 pb-3 md:grid"><span /><span className="muted text-sm">Single-buyer apps</span><span className="text-sm">Guild</span></div>
          {compare.map(([k, them, us]) => (
            <div key={k} className="grid gap-1 border-t border-white/10 py-4 md:grid-cols-[9rem_1fr_1fr] md:gap-6">
              <dt className="muted text-sm">{k}</dt>
              <dd className="muted max-md:text-xs max-md:line-through">{them}</dd>
              <dd>{us}</dd>
            </div>
          ))}
        </dl>
        <p className="muted mt-8 text-xs">Demo: marketplace figures come from seeded data and no money moves. On a phone, use Add to Home Screen to install Guild as an app.</p>
      </section>
    </main>
  )
}
