import Link from 'next/link'
import Image from 'next/image'
import Calculator from '@/components/Calculator'
import { sql, getMarket } from '@/lib/server'
import { SELLER_SHARE } from '@/lib/score'

export const dynamic = 'force-dynamic'

const compare = [
  ['Model', 'Closed pipeline into one robot', 'Open exchange any lab can buy from'],
  ['Supply', 'Household chores from anyone', 'Skilled trade work from people with years in the job'],
  ['Ownership', 'Contributor gives it away for a flat fee', 'Worker keeps it and earns a royalty on every licence'],
  ['Price', 'A flat fee the collector picks', 'A live market: bids, asks, and a rate that follows demand'],
  ['Proof', 'None shown', 'An evidence trail on every clip, from measurement to buyer acceptance'],
  ['Feedback', 'Accepted or rejected, after upload', 'Warnings while you record, so less footage is rejected'],
  ['Authenticity', 'Trust the uploader', 'In-app capture only, live challenge, motion sensors, hand tracking'],
  ['Output', 'Video for one model', 'Video, step list, and a hand-pose episode file for any gripper'],
]

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export default async function Home() {
  const [stats, trail, market] = await Promise.all([
    sql`select count(*)::int as listings, coalesce(sum(minutes), 0)::int / 60 as hours,
      (select coalesce(sum(hours * rate), 0)::int from calls where hours > 0) as book,
      (select count(distinct task)::int from calls where task is not null and hours > 0) as markets
      from uploads where status = 'scored' and quality_score >= 2 and withdrawn_at is null`.then((r) => r[0]).catch(() => null),
    sql`select (select count(*)::int from events) as n, e.upload_id from events e join uploads u on u.id = e.upload_id
      where u.status = 'scored' and u.quality_score >= 2 and u.withdrawn_at is null order by e.id desc limit 1`.then((r) => r[0]).catch(() => null),
    getMarket().catch(() => null),
  ])
  const rates = market && Object.fromEntries(Object.entries(market).sort((a, b) => b[1].rate - a[1].rate).map(([k, m]) => [k, m.rate]))

  return (
    <main>
      {/* Hero photo: shown clearly on the right (top on phones), tinted warm and faded into the page. */}
      <section className="relative isolate overflow-hidden">
        <Image src="/robot.jpg" alt="A humanoid robot working at a kitchen sink" fill priority sizes="100vw" className="-z-10 object-cover object-[68%_25%] saturate-[.85] max-md:h-[62%]! md:object-right" />
        <div className="absolute inset-0 -z-10 bg-rust/20 mix-blend-color" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-ink from-42% via-ink/80 via-58% to-transparent md:bg-linear-to-r md:from-ink md:from-28% md:via-ink/75 md:via-52% md:to-transparent" />
        <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-ink/85 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-48 bg-linear-to-t from-ink via-ink/80 to-transparent" />
        <div className="rise mx-auto grid min-h-[86dvh] max-w-6xl content-end gap-8 px-4 pb-10 pt-72 md:min-h-[82dvh] md:gap-12 md:pb-14 md:pt-28 md:[&>div]:max-w-xl">
          <div>
            <p className="label">The exchange for physical AI data</p>
            <h1 className="text-5xl md:text-7xl">The open market for robot training data.</h1>
            <p className="muted mt-5 max-w-md">AI can scrape the internet for information, but robots need structured experience of the physical world. Labs request exactly what their models are missing. Anyone with a phone records it in the app, verified as real, and earns on every licence.</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:flex">
              <Link href="/market" className="btn">See live prices</Link>
              <Link href="/sell" className="btn btn-ghost">Start earning</Link>
            </div>
          </div>
          {stats && (
            <dl className="grid max-w-3xl grid-cols-2 gap-x-10 gap-y-5 border-t border-paper/30 pt-5 tabular-nums md:grid-cols-4">
              {[[usd(stats.book), 'open bid book'], [`${stats.hours.toLocaleString('en-US')} h`, 'footage listed'], [stats.markets, 'trades with live bids'], [`${Math.round((1 - SELLER_SHARE) * 100)}%`, 'take rate per licence']].map(([n, l]) => (
                <div key={l}>
                  <dt className="text-3xl font-light tracking-tight md:text-4xl">{n}</dt>
                  <dd className="label mt-1">{l}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <p className="label">The business</p>
        <h2 className="max-w-3xl text-3xl md:text-5xl">A marketplace with no inventory cost and an asset that sells more than once.</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
          {[
            ['Supply costs nothing to stand up', 'Anyone signs up and records on the phone they own. No headset, no glove, no recruiting, no collection staff.'],
            ['Demand is visible before supply exists', 'Labs post bids: hours wanted at a rate per hour. The bid book tells workers what to film and tells us where revenue is.'],
            [`${Math.round((1 - SELLER_SHARE) * 100)}% of every licence`, 'Licences are non-exclusive, so one hour of footage can be sold to many buyers. Each resale is revenue with no new cost.'],
          ].map(([t, d], i) => (
            <div key={t} className="card flex items-start gap-4 p-5 md:block md:p-6">
              <p className="emboss text-5xl font-semibold md:text-6xl" aria-hidden>0{i + 1}</p>
              <div>
                <h3 className="text-xl md:mt-4">{t}</h3>
                <p className="muted mt-1 text-sm md:mt-2">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {rates && (
        <section className="mx-auto max-w-6xl px-4 pb-12">
          <p className="label">Unit economics</p>
          <h2 className="max-w-3xl text-3xl md:text-4xl">What an hour of skilled work is worth.</h2>
          <p className="muted mb-6 mt-3 max-w-2xl text-sm">Move the sliders. The same numbers answer the worker&apos;s question and the investor&apos;s.</p>
          <Calculator rates={rates} />
        </section>
      )}

      {/* Mission. The photo is tinted into the palette and faded into the page on every edge. */}
      <section id="mission" className="streaks border-y border-tan/15">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-28">
          <p className="label">Our mission</p>
          <h2 className="max-w-xl text-4xl md:text-6xl">Robot data should not belong to one company.</h2>
          <p className="mt-5 max-w-lg text-paper/80">Figure can spend a billion dollars on its own data. The hundreds of other robotics startups and labs cannot, and Figure shares nothing. We are the open market for everyone else: the people who do the work own the record of it, and any lab, startup or university can license it on the same terms.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <p className="label">For the people doing the work</p>
        <h2 className="max-w-3xl text-3xl md:text-5xl">If your skill trains a robot, you should be paid every time.</h2>
        <p className="muted mt-4 max-w-2xl">We cannot promise robots will not change your trade. What we can do is make sure the value of what you know comes back to you, and that you decide what happens with it.</p>
        <div className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4">
          {[
            ['A royalty, not a one-off fee', `You keep ${SELLER_SHARE * 100}% of every licence. The same clip can sell to many labs, and keeps paying when you are off the tools or retired.`],
            ['You own it and you can pull it', 'Buyers license your footage, they do not own it. Withdraw any clip from the market whenever you want.'],
            ['You see who buys and why', 'Every sale shows up on the clip with the buyer\'s reasons. No black box deciding what your work is worth.'],
            ['Experience pays more', 'Three years in the trade prices your work at 1.25x. Ten years, 1.5x. The market pays for skill, not just footage.'],
            ['It saves you paperwork', 'Each upload turns into a dated job record with the steps and tools, ready to hand to a customer or keep for training an apprentice.'],
            ['You choose what to film', 'Nothing records on its own. Film the repetitive or risky parts of the job you would hand off first.'],
          ].map(([t, d]) => (
            <div key={t} className="card p-5">
              <h3 className="text-xl">{t}</h3>
              <p className="muted mt-1 text-sm">{d}</p>
            </div>
          ))}
        </div>
        <Link href="/sell" className="btn mt-6">Check what your work would earn</Link>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-4 pb-12 md:grid-cols-2 md:gap-4">
        <Link href={trail ? `/buy/${trail.upload_id}` : '/buy'} className="card block p-6">
          <p className="label">Why buyers trust it</p>
          <h3 className="text-2xl">Every label has an audit trail</h3>
          <p className="muted mt-2 text-sm">Each clip records what the phone measured, what the model proposed, what a person changed, and why a buyer accepted it. Over time, knowing what each buyer accepts is the asset a competitor cannot copy. We do not have that advantage yet. We are building toward it.</p>
          <p className="mt-4 text-sm underline underline-offset-4">{trail ? `${trail.n} trail events so far. Open the latest` : 'Browse listings'}</p>
        </Link>
        <Link href="/market" className="card block p-6">
          <p className="label">Why prices are fair</p>
          <h3 className="text-2xl">Price discovery in the open</h3>
          <p className="muted mt-2 text-sm">Buyers bid, sellers ask, and the rate for each trade moves where everyone can see it. Scarce skills price higher, which pulls in the supply buyers need.</p>
          <p className="mt-4 text-sm underline underline-offset-4">See live prices</p>
        </Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-3xl md:text-4xl">An exchange, not a pipeline.</h2>
        <dl className="card mt-6 divide-y divide-tan/15 text-sm">
          <div className="hidden grid-cols-[9rem_1fr_1fr] gap-4 p-4 md:grid"><span /><span className="label !mb-0">Single-buyer collection apps</span><span className="label !mb-0 !text-paper">Guild</span></div>
          {compare.map(([k, them, us]) => (
            <div key={k} className="grid gap-1 p-4 md:grid-cols-[9rem_1fr_1fr] md:gap-4">
              <dt className="label !mb-0 md:text-sm md:normal-case md:tracking-normal">{k}</dt>
              <dd className="muted max-md:text-xs max-md:line-through">{them}</dd>
              <dd>{us}</dd>
            </div>
          ))}
        </dl>
        <p className="muted mt-6 text-xs">Figures on this page are read live from the demo database. Listings marked Sample are seeded and no money moves yet. On a phone, use Add to Home Screen in the share menu to install Guild as an app.</p>
      </section>
    </main>
  )
}
