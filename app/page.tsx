import Link from 'next/link'
import ArmScene from '@/components/ArmScene'
import Benefits from '@/components/Benefits'
import CostChart from '@/components/CostChart'
import Dither from '@/components/Dither'
import { sql } from '@/lib/server'

export const dynamic = 'force-dynamic'

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
            <h1 className="text-5xl md:text-7xl">The open market for task data.</h1>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/buy" className="btn">Browse data</Link>
              <Link href="/sell" className="btn btn-ghost">Start earning</Link>
            </div>
          </div>
          {stats && (
            <dl className="flex flex-wrap gap-x-7 gap-y-4 tabular-nums md:gap-x-12">
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

      <section id="chart" className={section}>
        <CostChart />
      </section>

      <div className="band-ember">
        <section className={section}>
          <h2 className="mb-5 text-center text-3xl md:mb-8 md:text-5xl">What is in it <span className="text-flame">for you</span></h2>
          <Benefits />
        </section>
      </div>

      <ArmScene />

      <section id="mission" className="tile tile-row on-flow rounded-none">
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
