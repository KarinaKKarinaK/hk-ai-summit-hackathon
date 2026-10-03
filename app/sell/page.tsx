import Link from 'next/link'
import UploadForm from '@/components/UploadForm'
import { sql, getUser, getMarket, priceOf } from '@/lib/server'
import { payout, signal, tier, SELLER_SHARE, type Labels } from '@/lib/score'
import { reviewLabels, setAsk, fillBid, toggleListed } from '../actions'

/** What the vision model saw that the seller did not enter. */
function suggestions(mine: Labels = {}, ai: Labels = {}): string[] {
  const out = (['perspective', 'task', 'industry'] as const).filter((k) => ai[k] && ai[k] !== mine[k]).map((k) => ai[k]!)
  return out.concat((ai.tools ?? []).filter((t) => !mine.tools?.some((m) => m.toLowerCase() === t.toLowerCase())))
}

// Open to everyone: you can try the quality check before you have an account.
export default async function Sell() {
  const user = await getUser()
  const [rows, calls, market] = await Promise.all([
    user ? sql`select u.*, ${user.years ?? 0}::int as years,
        (select coalesce(sum(price), 0)::int from purchases p where p.upload_id = u.id) as revenue,
        array(select buyer_id::text from purchases p where p.upload_id = u.id) as buyers,
        exists(select 1 from events e where e.upload_id = u.id and e.kind in ('changed', 'kept')) as reviewed
      from uploads u where seller_id = ${user.id} order by created_at desc` : [],
    user ? sql`select c.*, coalesce(b.org, b.name) as buyer from calls c join users b on b.id = c.buyer_id where c.hours > 0 and c.buyer_id <> ${user.id} order by c.rate desc` : [],
    getMarket(),
  ])
  const t = tier(user?.years)
  const hot = Object.entries(market).sort((a, b) => b[1].rate - a[1].rate).slice(0, 4)
  const rates = Object.fromEntries(Object.entries(market).map(([k, m]) => [k, { rate: m.rate, signal: signal(m) }]))
  const earned = payout(rows.reduce((a, r) => a + r.revenue, 0))
  const sales = rows.reduce((a, r) => a + r.buyers.length, 0)

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-5xl">Sell your work</h1>
          {user ? (
            <p className="muted mt-2 text-sm">
              {user.trade || 'No trade set'}, {user.years || 0} years. <span className="chip chip-slate">{t.name} {t.mult}x price</span>
              {user.credential && <span className="chip ml-2">{user.credential}</span>}
            </p>
          ) : (
            <p className="muted mt-2 text-sm">Pick a video to see its quality score and what it would earn. No account needed until you upload.</p>
          )}
        </div>
        <Link href="/record" className="btn btn-ghost">Record with hand tracking</Link>
      </div>

      {user && (
        <dl className="card grid grid-cols-3 gap-4 p-5">
          {[[`$${earned.toFixed(2)}`, 'earned in royalties'], [sales, 'licences sold'], [rows.filter((r) => r.status === 'scored' && r.quality_score >= 2 && !r.withdrawn_at).length, 'clips on the market']].map(([n, l]) => (
            <div key={l}><dt className="text-2xl font-light tracking-tight md:text-4xl">{n}</dt><dd className="label mt-1">{l}</dd></div>
          ))}
        </dl>
      )}

      <section className="card p-5">
        <div className="flex items-baseline justify-between">
          <p className="label">What pays right now</p>
          <Link href="/market" className="text-sm underline underline-offset-4">All prices</Link>
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4">
          {hot.map(([task, m]) => (
            <li key={task}>
              <p className="text-2xl font-light tracking-tight">${m.rate.toFixed(0)}<span className="muted text-sm">/h</span></p>
              <p className="text-sm">{task}</p>
              <p className="muted text-xs">{signal(m)}, {Math.round(m.demand)} h wanted</p>
            </li>
          ))}
        </ul>
      </section>

      <UploadForm years={user?.years ?? 0} rates={rates} />

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ['It stays yours', 'Buyers get a licence to train on the clip. You keep the footage and the rights.'],
          [`Paid every time, ${SELLER_SHARE * 100}% to you`, 'One clip can be licensed by many labs. Each sale pays you again, including after you are off the tools.'],
          ['You are in control', 'You choose what to film, you see who bought it and why, and you can withdraw a clip whenever you want.'],
        ].map(([h, p]) => (
          <div key={h} className="card p-5">
            <h2 className="text-lg">{h}</h2>
            <p className="muted mt-1 text-sm">{p}</p>
          </div>
        ))}
      </section>

      {!user ? (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm">Create a free account to upload, list and get paid.</p>
          <div className="flex gap-3"><Link href="/login?mode=register" className="btn">Create account</Link><Link href="/login" className="btn btn-ghost">Sign in</Link></div>
        </section>
      ) : (
        <section>
          <h2 className="text-2xl">My uploads</h2>
          {!rows.length && <p className="muted mt-4 text-sm">Nothing yet. Your first upload shows up here with its score and market price.</p>}
          <ul className="mt-4 grid gap-3">
            {rows.map((r) => {
              const l: Labels = r.labels ?? {}
              const sug = r.reviewed ? [] : suggestions(l, r.ai?.labels)
              const scored = r.status === 'scored'
              const listed = scored && r.quality_score >= 2 && !r.withdrawn_at
              const marketPrice = scored ? priceOf({ ...r, ask: null }, market) : 0
              const bid = listed && r.quality_score >= 3 && calls.find((c) => (!c.task || c.task === l.task) && (!c.industry || c.industry === l.industry) && !r.buyers.includes(c.buyer_id))
              return (
                <li key={r.id} className="card flex gap-4 p-4">
                  {r.thumb ? <img src={r.thumb} alt="" className="h-16 w-20 flex-none rounded-lg object-cover md:h-20 md:w-28" /> : <div className="streaks h-16 w-20 flex-none rounded-lg md:h-20 md:w-28" />}
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/buy/${r.id}`} className="truncate font-medium underline-offset-4 hover:underline">{r.title || 'Untitled clip'}</Link>
                      {scored ? (
                        <span className="flex items-center gap-2 text-sm"><span className="score" style={{ '--s': r.quality_score } as React.CSSProperties} /> {r.quality_score}/5</span>
                      ) : (
                        <span className="chip">Scoring</span>
                      )}
                    </div>
                    {scored && (
                      <p className="muted text-xs">
                        {r.withdrawn_at ? 'Withdrawn from the market. ' : listed ? `Listed at $${r.ask ?? marketPrice}${r.ask ? ` (your ask, market says $${marketPrice})` : ' (market price, moves with demand)'}. You get $${payout(r.ask ?? marketPrice).toFixed(2)} per sale. ` : r.duplicate_of ? 'Not listed: this matches a clip that was already uploaded. ' : 'Not listed: score below 2. '}
                        Sold {r.buyers.length} times. <Link href={`/buy/${r.id}`} className="underline underline-offset-4">Evidence trail and job record</Link>
                      </p>
                    )}
                    {r.ai?.reasons?.length > 0 && <p className="muted text-xs">{r.ai.reasons.join(' ')}</p>}
                    {scored && !r.ai && <p className="muted text-xs">Vision review did not run. Scored on technical checks and labels only.</p>}
                    {r.ai?.flags?.includes('faces') && <p className="text-xs text-amber-200">A face is visible in this clip.</p>}

                    {sug.length > 0 && (
                      <form action={reviewLabels} className="space-y-2 rounded-xl border border-slate/25 p-3">
                        <input type="hidden" name="id" value={r.id} />
                        <p className="flex flex-wrap items-center gap-2"><span className="label !mb-0">Model proposed</span>{sug.map((s) => <span key={s} className="chip chip-slate">{s}</span>)}</p>
                        <input name="note" className="input" maxLength={500} placeholder="Why you agree or disagree (goes on the evidence trail)" aria-label="Review note" />
                        <div className="flex gap-2">
                          <button name="decision" value="accept" className="btn !min-h-9 text-sm">Accept changes</button>
                          <button name="decision" value="keep" className="btn btn-ghost !min-h-9 text-sm">Keep mine</button>
                        </div>
                      </form>
                    )}

                    {listed && (
                      <div className="flex flex-wrap items-end gap-3">
                        <form action={setAsk} className="flex items-end gap-2">
                          <input type="hidden" name="id" value={r.id} />
                          <div>
                            <label className="label" htmlFor={`ask-${r.id}`}>Your ask, USD</label>
                            <input id={`ask-${r.id}`} name="ask" type="number" min={5} inputMode="numeric" defaultValue={r.ask ?? ''} placeholder={`Market ${marketPrice}`} className="input !w-32" />
                          </div>
                          <button className="btn btn-ghost">{r.ask ? 'Update' : 'Set ask'}</button>
                        </form>
                        {bid && (
                          <form action={fillBid}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="call" value={bid.id} />
                            <button className="btn">Sell now ${Math.max(1, Math.round((bid.rate * r.minutes) / 60))} to {bid.buyer} (bid ${bid.rate}/h)</button>
                          </form>
                        )}
                      </div>
                    )}
                    {scored && r.quality_score >= 2 && (
                      <form action={toggleListed}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="muted text-xs underline underline-offset-4">{r.withdrawn_at ? 'Put back on the market' : 'Withdraw from the market'}</button>
                      </form>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
