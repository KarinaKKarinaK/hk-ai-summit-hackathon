import Link from 'next/link'
import SellStart from '@/components/SellStart'
import Calculator from '@/components/Calculator'
import { sql, getUser, getMarket, priceOf } from '@/lib/server'
import { payout, signal, tier, matchesCall, SELLER_SHARE, HOLD_DAYS, type Labels } from '@/lib/score'
import { reviewLabels, setAsk, fillBid, toggleListed } from '../actions'

/** What the vision model saw that the seller did not enter. */
function suggestions(mine: Labels = {}, ai: Labels = {}): string[] {
  const out = (['perspective', 'task', 'industry'] as const).filter((k) => ai[k] && ai[k] !== mine[k]).map((k) => ai[k]!)
  return out.concat((ai.tools ?? []).filter((t) => !mine.tools?.some((m) => m.toLowerCase() === t.toLowerCase())))
}

// Open to everyone. Two ways to add data: record live on /record, or upload from the gallery right here.
export default async function Sell() {
  const user = await getUser()
  const [rows, calls, market] = await Promise.all([
    user ? sql`select u.*, ${user.years ?? 0}::int as years,
        (select coalesce(sum(price - coalesce(fee, 0)), 0)::int from purchases p where p.upload_id = u.id) as revenue,
        (select coalesce(sum(bonus), 0)::int from purchases p where p.upload_id = u.id) as bonus,
        array(select buyer_id::text from purchases p where p.upload_id = u.id) as buyers,
        exists(select 1 from events e where e.upload_id = u.id and e.kind in ('changed', 'kept')) as reviewed
      from uploads u where seller_id = ${user.id} order by created_at desc` : [],
    sql`select c.*, coalesce(b.org, b.name) as buyer from calls c join users b on b.id = c.buyer_id where c.hours > 0 and c.buyer_id is distinct from ${user?.id ?? null}::uuid order by c.rate desc`,
    getMarket(),
  ])
  const t = tier(user?.years)
  const hot = Object.entries(market).sort((a, b) => b[1].rate - a[1].rate).slice(0, 4)
  const earned = payout(rows.reduce((a, r) => a + r.revenue, 0)) + rows.reduce((a, r) => a + r.bonus, 0)
  const sales = rows.reduce((a, r) => a + r.buyers.length, 0)

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-5xl">Earn</h1>
          {user ? (
            <p className="muted mt-2 text-sm">
              {user.trade || 'No trade set'}, {user.years || 0} years. <span className="chip chip-slate">{t.name} {t.mult}x price</span>
              {user.credential && <span className="chip ml-2">{user.credential}</span>}
            </p>
          ) : (
            <p className="muted mt-2 text-sm">Record how you do a task, with your hands or on your screen. Watch it get checked and labelled, then see what it earns.</p>
          )}
        </div>
      </div>

      {user && (
        <dl className="card grid grid-cols-3 gap-4 p-5">
          {[[`$${earned.toFixed(2)}`, 'earned: royalties and result bonuses'], [sales, 'licences sold'], [rows.filter((r) => r.status === 'scored' && r.quality_score >= 2 && !r.withdrawn_at).length, 'clips on the market']].map(([n, l]) => (
            <div key={l}><dt className="text-2xl font-light tracking-tight md:text-4xl">{n}</dt><dd className="label mt-1">{l}</dd></div>
          ))}
        </dl>
      )}

      {/* add data: record live or upload from the gallery. Either one runs the processing pipeline. */}
      <SellStart years={user?.years ?? 0} />

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* the three best-paying trades as bars: length is the rate, nothing else to read */}
        <div className="card min-w-0 p-5 md:p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Top paying now</h2>
            <Link href="/market" className="muted text-sm underline underline-offset-4">All prices</Link>
          </div>
          <ul className="space-y-5">
            {hot.slice(0, 3).map(([task, m], i) => (
              <li key={task}>
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{task}</span>
                  <span className="text-2xl font-light tabular-nums">${m.rate.toFixed(0)}<span className="muted text-sm">/h</span></span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[.06]">
                  <div className="h-full rounded-full bg-linear-to-r from-flame via-flame to-blush" style={{ width: `${(m.rate / hot[0][1].rate) * 100}%`, opacity: 1 - i * 0.22 }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card card-warm min-w-0 p-5 md:p-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Guaranteed pay</h2>
            <Link href="/calls" className="btn !min-h-9 text-sm">Browse open requests</Link>
          </div>
          <ul className="space-y-2">
            {calls.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link href={`/record?request=${c.id}&title=${encodeURIComponent(c.title)}`} className="flex items-center justify-between gap-3 rounded-box bg-ink/40 p-3 pl-4 transition-colors hover:bg-ink/60">
                  <span className="min-w-0 truncate font-medium">{c.title}</span>
                  <span className="flex-none text-lg font-light tabular-nums">${c.rate}<span className="text-xs text-paper/60">/h</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
              const bid = listed && r.quality_score >= 3 && calls.find((c) => matchesCall(c, l, r.minutes) && !r.buyers.includes(c.buyer_id))
              return (
                <li key={r.id} className="card flex gap-4 p-4">
                  {r.thumb ? <img src={r.thumb} alt="" className="h-16 w-20 flex-none rounded-box object-cover md:h-20 md:w-28" /> : <div className="streaks h-16 w-20 flex-none rounded-box md:h-20 md:w-28" />}
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
                        {r.withdrawn_at ? 'Withdrawn from the market. ' : listed ? `Listed at $${r.ask ?? marketPrice}${r.ask ? ` (your ask, market says $${marketPrice})` : ' (market price, moves with demand)'}. You get $${payout(r.ask ?? marketPrice).toFixed(2)} per sale, released after ${HOLD_DAYS} days. ` : r.duplicate_of ? 'Not listed: this matches a clip that was already uploaded. ' : 'Not listed: score below 2. '}
                        Sold {r.buyers.length} times. <Link href={`/sell/${r.id}`} className="underline underline-offset-4">Processing report{r.golden ? '' : ', check labels to make it golden'}</Link>
                      </p>
                    )}
                    {r.ai?.reasons?.length > 0 && <p className="muted text-xs">{r.ai.reasons.join(' ')}</p>}
                    {scored && !r.ai && <p className="muted text-xs">Vision review did not run. Scored on technical checks and labels only.</p>}
                    {r.ai?.flags?.includes('faces') && <p className="text-xs text-amber-200">A face is visible in this clip.</p>}

                    {sug.length > 0 && (
                      <form action={reviewLabels} className="space-y-2 rounded-box bg-white/5 p-3">
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
      <section>
        <h2 className="mb-4 text-xl font-semibold tracking-tight">Estimate your earnings</h2>
        <Calculator rates={Object.fromEntries(Object.entries(market).sort((a, b) => b[1].rate - a[1].rate).map(([k, m]) => [k, m.rate]))} />
      </section>
    </main>
  )
}
