import Link from 'next/link'
import Image from 'next/image'
import Calculator from '@/components/Calculator'
import ArmScene from '@/components/ArmScene'
import { sql, getMarket } from '@/lib/server'
import { SELLER_SHARE } from '@/lib/score'

export const dynamic = 'force-dynamic'

const steps = [
  ['Request', 'A lab posts exactly what its model is missing, with a budget.'],
  ['Record', 'Anyone films it in the app. A live challenge and motion sensors prove it is real.'],
  ['Earn', 'The request pays on acceptance, and the clip keeps earning every time it is licensed.'],
]

const workers = [
  ['A royalty, not a fee', `You keep ${SELLER_SHARE * 100}% of every licence, and one clip can sell to many labs.`],
  ['It stays yours', 'Buyers license your footage. Withdraw any clip whenever you want.'],
  ['Nothing hidden', 'Open prices, and you see who bought your work and why.'],
]

const compare = [
  ['Model', 'Closed pipeline into one robot', 'Open exchange any lab can buy from'],
  ['Ownership', 'Given away for a flat fee', 'Worker keeps it, earns on every licence'],
  ['Price', 'Set by the collector', 'A live market that follows demand'],
  ['Proof', 'Trust the uploader', 'Filmed in-app, live challenge, evidence trail'],
  ['Feedback', 'Rejected after upload', 'Warnings while you record'],
]

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

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
      {/* Hero photo: clear on the right (top on phones), tinted warm and faded into the page. */}
      <section className="relative isolate overflow-hidden">
        <Image src="/robot.jpg" alt="A humanoid robot working at a kitchen sink" fill priority sizes="100vw" className="-z-10 object-cover object-[68%_25%] saturate-[.85] max-md:h-[62%]! md:object-right" />
        <div className="absolute inset-0 -z-10 bg-rust/20 mix-blend-color" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-ink from-42% via-ink/80 via-58% to-transparent md:bg-linear-to-r md:from-ink md:from-28% md:via-ink/75 md:via-52% md:to-transparent" />
        <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-ink/85 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-linear-to-t from-ink via-ink/80 to-transparent" />
        <div className="rise mx-auto grid min-h-[86dvh] max-w-6xl content-end gap-10 px-4 pb-12 pt-72 md:min-h-[82dvh] md:pb-16 md:pt-28">
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

      <section data-tilt className="mx-auto grid max-w-6xl gap-3 px-4 py-20 md:grid-cols-3 md:py-28">
        {steps.map(([t, d], i) => (
          <div key={t} className={`card p-6 ${i === 1 ? 'card-warm' : ''}`}>
            <p className="grid h-9 w-9 place-items-center rounded-full bg-tan text-sm font-semibold tabular-nums">{i + 1}</p>
            <h2 className="mt-4 text-3xl font-semibold">{t}</h2>
            <p className="muted mt-3 max-w-xs">{d}</p>
          </div>
        ))}
      </section>

      <ArmScene />

      {rates && (
        <section data-tilt className="mx-auto max-w-6xl px-4 pb-20 md:pb-28">
          <h2 className="max-w-2xl text-3xl md:text-5xl">What an hour of skilled work is worth.</h2>
          <p className="muted mb-8 mt-4 max-w-xl">The platform takes {Math.round((1 - SELLER_SHARE) * 100)}% of each licence. Supply costs nothing to stand up, and one clip sells many times.</p>
          <Calculator rates={rates} />
        </section>
      )}

      <section id="mission" className="streaks">
        <div className="mx-auto max-w-6xl px-4 py-24 md:py-36">
          <h2 className="max-w-2xl text-4xl md:text-6xl">Robot data should not belong to one company.</h2>
          <p className="mt-6 max-w-lg text-lg text-paper/75">Figure can spend a billion dollars on its own data and shares nothing. We are the open market for everyone else.</p>
        </div>
      </section>

      <section data-tilt className="mx-auto max-w-6xl px-4 py-20 md:py-28">
        <h2 className="max-w-2xl text-3xl md:text-5xl">If your skill trains a robot, you get paid every time.</h2>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {workers.map(([t, d], i) => (
            <div key={t} className={`card p-6 ${i === 0 ? 'card-warm' : ''}`}>
              <h3 className="text-xl font-semibold">{t}</h3>
              <p className="muted mt-2 max-w-xs">{d}</p>
            </div>
          ))}
        </div>
        <Link href="/sell" className="btn mt-12">Start earning</Link>
      </section>

      <section data-tilt className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-3xl md:text-5xl">An exchange, not a pipeline.</h2>
        <dl className="mt-10 text-sm md:text-base">
          <div className="hidden grid-cols-[9rem_1fr_1fr] gap-6 pb-3 md:grid"><span /><span className="muted text-sm">Single-buyer apps</span><span className="text-sm">Guild</span></div>
          {compare.map(([k, them, us]) => (
            <div key={k} className="grid gap-1 border-t border-white/10 py-4 md:grid-cols-[9rem_1fr_1fr] md:gap-6">
              <dt className="muted text-sm">{k}</dt>
              <dd className="muted max-md:text-xs max-md:line-through">{them}</dd>
              <dd>{us}</dd>
            </div>
          ))}
        </dl>
        <p className="muted mt-10 text-xs">Demo: figures come from seeded data and no money moves. On a phone, use Add to Home Screen to install Guild as an app.</p>
      </section>
    </main>
  )
}
