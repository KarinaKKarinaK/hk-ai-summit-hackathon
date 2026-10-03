import Link from 'next/link'
import ArmScene from '@/components/ArmScene'
import Benefits from '@/components/Benefits'
import Dither from '@/components/Dither'
import { sql } from '@/lib/server'

export const dynamic = 'force-dynamic'

// Hours of training data that 1,000 USD buys, from published per-hour collection costs:
// teleoperation 28 to 60 USD/h, raw egocentric video 15 to 22 USD/h. Sources are linked under the chart.
const BUDGET = [
  [17, 'Teleoperation, complex rig', '$60/h'],
  [36, 'Teleoperation, simple rig', '$28/h'],
  [45, 'Human video, high end', '$22/h'],
  [67, 'Human video, low end', '$15/h'],
] as const

// The whole product in four steps. Each is a poster: its own tone, and its own height on the page.
const STEPS = [
  ['Request', 'A company asks for examples of the task it needs.', 'flow', 'md:mt-10'],
  ['Record', 'A person films their hands, or records their screen, doing it.', 'coal', 'md:mt-24'],
  ['Label', 'Kimi turns the recording into steps and labels.', 'flame', ''],
  ['Buy', 'The company downloads a checked, labelled dataset.', 'flow', 'md:mt-16'],
] as const

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const section = 'mx-auto max-w-6xl px-4 py-8 md:py-14'

export default async function Home() {
  const stats = await sql`select coalesce(sum(minutes), 0)::int / 60 as hours,
      (select coalesce(sum(hours * rate), 0)::int from calls where hours > 0) as book,
      (select count(distinct task)::int from calls where task is not null and hours > 0) as markets
      from uploads where status = 'scored' and quality_score >= 2 and withdrawn_at is null`.then((r) => r[0]).catch(() => null)

  return (
    <main>
      {/* Hero: what it is in one line, the two ways in, three live numbers. The video sits in its own frame. */}
      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-8 pt-10 md:grid-cols-[1fr_1.05fr] md:gap-14 md:pb-16 md:pt-16">
        <div className="rise">
          <p className="label">Task data marketplace</p>
          <h1 className="text-5xl md:text-7xl">The open market for task data.</h1>
          <p className="mt-5 max-w-md text-lg text-paper/80">Companies post the tasks their AI needs to learn. People record themselves doing them. Every clip is checked, labelled and licensed.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/buy" className="btn">Browse data</Link>
            <Link href="/sell" className="btn btn-ghost">Start earning</Link>
          </div>
          {stats && (
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-white/10 pt-6 tabular-nums">
              {[[usd(stats.book), 'in open requests'], [`${stats.hours.toLocaleString('en-US')} h`, 'footage listed'], [stats.markets, 'live markets']].map(([n, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-medium tracking-tight md:text-3xl">{n}</dt>
                  <dd className="muted mt-0.5 text-xs md:text-sm">{l}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <video autoPlay muted loop playsInline poster="/hero.jpg" aria-hidden className="aspect-[4/3] w-full rounded-[28px] object-cover object-[60%_center] md:aspect-[4/5] md:rounded-[36px]">
          <source src="/hero.mp4" type="video/mp4" />
        </video>
      </section>

      <section className={section}>
        <ol className="grid grid-cols-2 items-start gap-3 md:grid-cols-4 md:gap-5">
          {STEPS.map(([t, d, tone, drop], i) => (
            <li key={t} className={`tile tile-lift flex min-h-44 flex-col justify-end p-4 md:min-h-72 md:p-6 ${drop} ${i % 2 ? 'max-md:mt-8' : ''} ${tone === 'flame' ? 'tile-flame text-ink' : tone === 'flow' ? 'on-flow' : 'tile-coal'}`}>
              <Dither tone={tone} seed={i * 2.3 + 1} />
              <p className="mb-auto text-xs tabular-nums opacity-80">0{i + 1}</p>
              <h2 className="text-2xl font-semibold md:text-4xl">{t}</h2>
              <p className="mt-1.5 text-xs opacity-90 md:text-sm">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The case in one chart, on its own rounded panel: a tag, a headline, one big number, and four bars with the last one lit. */}
      <section id="chart" className={section}>
        <div className="rounded-[28px] bg-[#1d1b20] p-5 md:rounded-[40px] md:p-12">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_2fr] md:gap-12">
            <div className="flex flex-col">
              <p className="chip chip-flame self-start">Why human video</p>
              <h2 className="mt-4 text-3xl md:text-5xl">More robot data for the <span className="text-flame">same money</span></h2>
              <p className="mt-4 max-w-xs text-sm text-paper/80 md:mt-auto md:text-base">Filming a person costs a third to half as much per hour as teleoperating a robot, and collects 3 to 5 times faster. The same budget buys up to:</p>
              <p className="text-dither mt-2 self-start text-7xl font-medium leading-none tracking-tighter md:text-[10rem]">4x</p>
            </div>
            {/* each bar carries its own numbers: hours bought at the top, cost per hour at the foot, what it is underneath */}
            <div className="grid grid-cols-4 gap-2 md:gap-4">
              {BUDGET.map(([h, name, cost], i) => {
                const lit = i === BUDGET.length - 1
                return (
                  <div key={name} className="flex flex-col">
                    <div className="flex h-56 items-end md:h-[26rem]">
                      <div className={`flex w-full flex-col justify-between rounded-lg p-2 md:rounded-2xl md:p-4 ${lit ? 'bg-flame text-ink' : 'bg-white/[.08]'}`} style={{ height: `${(h / 67) * 100}%` }}>
                        <p className="text-xl font-medium leading-none tabular-nums md:text-5xl">{h} h</p>
                        <p className={`text-[11px] tabular-nums md:text-sm ${lit ? 'font-medium' : 'muted'}`}>{cost}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] leading-tight text-paper/80 md:mt-3 md:text-sm">{name}</p>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="muted mt-6 text-xs">
            Hours of training data per $1,000, worked out from published collection costs per hour. Public teleoperated robot data totals about 11,000 hours (Open X-Embodiment), while the largest private collection, 16M+ videos, is shared with nobody.
            Sources: <a className="underline" href="https://dexset.ai/blogs/egocentric-data-collection-robotics/">Dexset</a>, <a className="underline" href="https://truelabel.ai/solutions/egocentric-video-data">truelabel</a>, <a className="underline" href="https://arxiv.org/abs/2606.20521">HumanScale</a>. Reported figures, not verified by us.
          </p>
        </div>
      </section>

      <div className="band-ember">
        <section className={section}>
          <h2 className="mb-5 text-center text-3xl md:mb-8 md:text-5xl">What is in it <span className="text-flame">for you</span></h2>
          <Benefits />
        </section>
      </div>

      <ArmScene />

      <section id="mission" className="tile tile-row on-flow">
        <Dither tone="flow" seed={4.2} />
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-28">
          <h2 className="max-w-2xl text-4xl md:text-6xl">Robot data should not belong to one company.</h2>
          <p className="mt-6 max-w-lg text-lg">Figure can spend a billion dollars on its own data and shares nothing. We are the open market for everyone else.</p>
        </div>
      </section>

      <p className="muted mx-auto max-w-6xl px-4 py-8 text-xs">Demo: marketplace figures come from seeded data and no money moves. On a phone, use Add to Home Screen to install Guild as an app.</p>
    </main>
  )
}
