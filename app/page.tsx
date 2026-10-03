import ArmScene from '@/components/ArmScene'
import Benefits from '@/components/Benefits'
import CostChart from '@/components/CostChart'
import Hero from '@/components/Hero'
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

const section = 'mx-auto max-w-6xl px-4 py-8 md:py-14'

export default async function Home() {
  const stats = await sql`select coalesce(sum(minutes), 0)::int / 60 as hours,
      (select coalesce(sum(hours * rate), 0)::int from calls where hours > 0) as book,
      (select count(distinct task)::int from calls where task is not null and hours > 0) as markets
      from uploads where status = 'scored' and quality_score >= 2 and withdrawn_at is null`.then((r) => r[0]).catch(() => null)

  return (
    <main>
      <Hero stats={stats as { book: number; hours: number; markets: number } | null} />

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
