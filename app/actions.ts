'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sql, hash, verify, createSession, requireUser, getMarket, priceOf, log } from '@/lib/server'
import { LABELS, ACCEPT_REASONS, PASS_REASONS, packages, technical, completeness, finalScore, tier, matchesCall, unavailable, RESULT_BONUS, type Labels } from '@/lib/score'

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max)
const int = (f: FormData, k: string, max: number) => Math.min(max, Math.max(0, parseInt(str(f, k)) || 0))
const pick = (list: readonly string[], v: string) => (list.includes(v) ? v : null)
const picks = (f: FormData, k: string, list: readonly string[]) => f.getAll(k).map(String).filter((v) => list.includes(v))
const uuid = (f: FormData, k: string) => (/^[0-9a-f-]{36}$/.test(str(f, k)) ? str(f, k) : redirect('/'))

// ponytail: no login rate limit. Add Vercel Firewall rate limiting on /login before real users.
export async function register(f: FormData) {
  const fail = (m: string): never => redirect(`/login?mode=register&error=${encodeURIComponent(m)}`)
  const email = str(f, 'email').toLowerCase()
  const password = String(f.get('password') ?? '')
  const name = str(f, 'name', 80)
  const role = str(f, 'role')
  if (!name) fail('Enter your name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email')
  if (password.length < 8 || password.length > 200) fail('Password needs at least 8 characters')
  if (role !== 'seller' && role !== 'buyer') fail('Pick seller or buyer')
  const seller = role === 'seller'
  const rows = await sql`insert into users (email, name, pass, role, org, trade, years, credential)
    values (${email}, ${name}, ${hash(password)}, ${role}, ${str(f, 'org', 80) || null},
      ${seller ? str(f, 'trade', 60) || null : null}, ${seller ? int(f, 'years', 60) : 0}, ${seller ? str(f, 'credential', 120) || null : null})
    on conflict (email) do nothing returning id`
  if (!rows[0]) fail('That email is already registered')
  await createSession(rows[0].id)
  redirect(seller ? '/sell' : '/buy')
}

export async function login(f: FormData) {
  const rows = await sql`select id, pass, role from users where email = ${str(f, 'email').toLowerCase()}`
  const user = rows[0]
  if (!user?.pass || !verify(String(f.get('password') ?? ''), user.pass)) redirect(`/login?error=${encodeURIComponent('Wrong email or password')}`)
  await createSession(user.id)
  redirect(user.role === 'seller' ? '/sell' : '/buy')
}

export async function logout() {
  const jar = await cookies()
  const token = jar.get('sid')?.value
  if (token) await sql`delete from sessions where token = ${token}`
  jar.delete('sid')
  redirect('/')
}

/** The human review step: seller takes the model's labels or keeps their own. Either way it goes on the trail, with why. */
export async function reviewLabels(f: FormData) {
  const user = await requireUser()
  const [r] = await sql`select id, labels, ai, metrics, description, steps, quality_score from uploads where id = ${uuid(f, 'id')} and seller_id = ${user.id}`
  if (!r?.ai?.labels) redirect('/sell')
  const before: Labels = r.labels ?? {}, ai: Labels = r.ai.labels
  if (str(f, 'decision') !== 'accept') {
    await log(r.id, 'seller', 'kept', { proposed: ai, kept: before }, user.id, str(f, 'note', 500))
  } else {
    const after: Labels = { ...before }
    for (const k of ['perspective', 'task', 'industry'] as const) if (ai[k]) after[k] = ai[k]
    const seen = new Set((before.tools ?? []).map((t) => t.toLowerCase()))
    after.tools = [...(before.tools ?? []), ...(ai.tools ?? []).filter((t) => !seen.has(t.toLowerCase()))]
    const fields = (['perspective', 'task', 'industry', 'tools'] as const).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    const score = finalScore(technical(r.metrics ?? {}), completeness(after, r.description ?? '', r.steps ?? ''), r.ai.quality_score)
    await sql`update uploads set labels = ${JSON.stringify(after)}::jsonb, quality_score = ${score} where id = ${r.id}`
    await log(r.id, 'seller', 'changed', { fields, before, after, score_before: r.quality_score, score_after: score }, user.id, str(f, 'note', 500))
  }
  revalidatePath('/sell')
}

/** Seller names their own price, or clears it to follow the market. */
export async function setAsk(f: FormData) {
  const user = await requireUser()
  const [r] = await sql`select u.id, u.labels, u.minutes, u.quality_score, s.years from uploads u join users s on s.id = u.seller_id
    where u.id = ${uuid(f, 'id')} and u.seller_id = ${user.id} and u.status = 'scored'`
  if (!r) redirect('/sell')
  const ask = int(f, 'ask', 1_000_000) || null
  if (ask && ask < 5) redirect('/sell')
  await sql`update uploads set ask = ${ask} where id = ${r.id}`
  await log(r.id, 'seller', 'ask', { ask, market: priceOf(r, await getMarket()) }, user.id)
  revalidatePath('/sell')
}

export async function postCall(f: FormData) {
  const user = await requireUser()
  const title = str(f, 'title', 120)
  const hours = int(f, 'hours', 100000), rate = int(f, 'rate', 10000)
  if (!title || !hours || !rate) redirect('/calls?error=' + encodeURIComponent('A call needs a title, hours and a rate'))
  // A bounty is a bid plus a spec: what to film, how, and how much of it.
  await sql`insert into calls (buyer_id, title, description, task, industry, hours, hours_total, rate, demos, min_people, perspective, environment, objects, min_seconds, wants_failures, weakness, forward, due)
    values (${user.id}, ${title}, ${str(f, 'description', 1000)}, ${pick(LABELS.task, str(f, 'task'))}, ${pick(LABELS.industry, str(f, 'industry'))}, ${hours}, ${hours}, ${rate}, ${int(f, 'demos', 1000000) || null}, ${int(f, 'min_people', 100000) || null},
      ${pick(LABELS.perspective, str(f, 'perspective'))}, ${str(f, 'environment', 120) || null}, ${str(f, 'objects', 200) || null}, ${int(f, 'min_seconds', 3600) || null},
      ${f.get('wants_failures') === 'on'}, ${str(f, 'weakness', 200) || null}, ${f.get('forward') === 'on'}, ${/^\d{4}-\d{2}-\d{2}$/.test(str(f, 'due')) ? str(f, 'due') : null})`
  revalidatePath('/calls')
  redirect('/calls')
}

/** Pay on results: the buyer reports what the clip did for their model. An improvement pays the seller a bonus, once. */
export async function reportResult(f: FormData) {
  const user = await requireUser()
  const id = uuid(f, 'id'), outcome = pick(['improved', 'no change', 'worse'], str(f, 'outcome'))
  const [p] = await sql`select id, price, bonus from purchases where upload_id = ${id} and buyer_id = ${user.id} order by created_at limit 1`
  if (!p || !outcome) redirect(`/buy/${id}`)
  const bonus = outcome === 'improved' && !p.bonus ? Math.max(1, Math.round(p.price * RESULT_BONUS)) : 0
  if (bonus) await sql`update purchases set bonus = ${bonus} where id = ${p.id}`
  await log(id, 'buyer', 'result', { outcome, bonus, metric: str(f, 'metric', 120) }, user.id, str(f, 'note', 500))
  revalidatePath(`/buy/${id}`)
  redirect(`/buy/${id}`)
}

/** USD/h at par quality that this sale implies. Feeds the market's last-sale price. */
function impliedRate(price: number, r: Record<string, any>) {
  // ponytail: clips that hit the 5 dollar floor would imply absurd hourly rates, so they do not move the market.
  return price > 5 && r.minutes > 0 ? price / ((r.minutes / 60) * (r.quality_score / 4) * tier(r.years).mult) : null
}

// No payments by design (cut list). A purchase is a row, and it unlocks the files.
// The buyer must say why they accept: that reason is the data we are really collecting.
export async function buy(f: FormData) {
  const user = await requireUser()
  const id = uuid(f, 'id')
  const [r] = await sql`select u.id, u.seller_id, u.ask, u.labels, u.minutes, u.quality_score, u.golden, u.ai, u.labelsets, s.years from uploads u join users s on s.id = u.seller_id
    where u.id = ${id} and u.status = 'scored' and u.quality_score >= 2 and u.withdrawn_at is null`
  if (!r || r.seller_id === user.id) redirect('/buy')
  const base = priceOf(r, await getMarket()) // priced server-side at the moment of sale
  const pkg = packages(base).find((p) => p.key === str(f, 'package'))
  const reasons = picks(f, 'reasons', ACCEPT_REASONS), note = str(f, 'note', 500)
  if (!pkg || unavailable(pkg.key, r)) redirect(`/buy/${id}`)
  if (!reasons.length && !note) redirect(`/buy/${id}?error=${encodeURIComponent('Pick at least one reason for accepting this clip')}`)
  const rate = impliedRate(base, r)
  await sql`insert into purchases (buyer_id, upload_id, package, price, rate, fee) values (${user.id}, ${id}, ${pkg.key}, ${pkg.price}, ${rate}, ${pkg.labelling})`
  await log(id, 'buyer', 'accepted', { package: pkg.name, price: pkg.price, labelling_fee: pkg.labelling, rate, reasons, score: r.quality_score, labels: r.labels }, user.id, note)
  revalidatePath(`/buy/${id}`)
  redirect(`/buy/${id}`)
}

/** A buyer saying no is as useful as a yes. */
export async function pass(f: FormData) {
  const user = await requireUser()
  const id = uuid(f, 'id')
  const [r] = await sql`select id, quality_score, labels from uploads where id = ${id} and status = 'scored'`
  const reasons = picks(f, 'reasons', PASS_REASONS), note = str(f, 'note', 500)
  if (!r || (!reasons.length && !note)) redirect(`/buy/${id}?error=${encodeURIComponent('Pick a reason for passing')}`)
  await log(id, 'buyer', 'passed', { reasons, score: r.quality_score, labels: r.labels }, user.id, note)
  revalidatePath(`/buy/${id}`)
  redirect(`/buy/${id}`)
}

/** Sell now: the seller fills a buyer's standing bid (an open call) at the bid's hourly rate. */
export async function fillBid(f: FormData) {
  const user = await requireUser()
  const [r] = await sql`select u.id, u.labels, u.minutes, u.quality_score from uploads u
    where u.id = ${uuid(f, 'id')} and u.seller_id = ${user.id} and u.status = 'scored' and u.quality_score >= 3 and u.withdrawn_at is null`
  const [c] = await sql`select * from calls where id = ${uuid(f, 'call')} and hours > 0`
  const l = r?.labels ?? {}
  if (!r || !c || c.buyer_id === user.id || !matchesCall(c, l, r.minutes)) redirect('/sell')
  const done = await sql`select 1 from purchases where upload_id = ${r.id} and buyer_id = ${c.buyer_id}`
  if (done.length) redirect('/sell')
  const hours = r.minutes / 60, price = Math.max(1, Math.round(c.rate * hours))
  await sql`insert into purchases (buyer_id, upload_id, package, price, rate, call_id) values (${c.buyer_id}, ${r.id}, 'both', ${price}, ${c.rate}, ${c.id})`
  await sql`update calls set hours = greatest(hours - ${hours}, 0) where id = ${c.id}`
  await log(r.id, 'buyer', 'accepted', { package: 'Raw + processed', price, rate: c.rate, via: 'bid', reasons: [`Standing bid: ${c.title}`], score: r.quality_score, labels: l }, c.buyer_id, c.description ?? '')
  revalidatePath('/sell')
}

/** Seller control: pull a clip off the market, or put it back. Licences already sold stay valid. */
export async function toggleListed(f: FormData) {
  const user = await requireUser()
  const [r] = await sql`update uploads set withdrawn_at = case when withdrawn_at is null then now() else null end
    where id = ${uuid(f, 'id')} and seller_id = ${user.id} returning id, withdrawn_at`
  if (r) await log(r.id, 'seller', r.withdrawn_at ? 'withdrawn' : 'relisted', {}, user.id)
  revalidatePath('/sell')
}

/** Golden clips: the seller checks every label by hand against the footage. Human-verified clips list for more. */
export async function verifyLabels(f: FormData) {
  const user = await requireUser()
  const [r] = await sql`select id, labels, ai, metrics, description, quality_score from uploads
    where id = ${uuid(f, 'id')} and seller_id = ${user.id} and status = 'scored' and duplicate_of is null and quality_score >= 2`
  if (!r) redirect('/sell')
  const fail = (m: string): never => redirect(`/sell/${r.id}?error=${encodeURIComponent(m)}`)
  if (f.get('watched') !== 'on') fail('Confirm that you watched the clip and checked each label')
  const before: Labels = r.labels ?? {}
  const after: Labels = {
    task: pick(LABELS.task, str(f, 'task')) ?? undefined, industry: pick(LABELS.industry, str(f, 'industry')) ?? undefined,
    perspective: pick(LABELS.perspective, str(f, 'perspective')) ?? undefined, outcome: pick(LABELS.outcome, str(f, 'outcome')) ?? undefined, device: before.device,
    tools: str(f, 'tools', 400).split(',').map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 12),
  }
  if (!after.task || !after.perspective) fail('A golden clip needs at least a task and a camera view')
  const steps = str(f, 'steps', 2000)
  const fields = (['task', 'industry', 'perspective', 'outcome', 'tools'] as const).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
  const score = finalScore(technical(r.metrics ?? {}), completeness(after, r.description ?? '', steps), r.ai?.quality_score)
  await sql`update uploads set labels = ${JSON.stringify(after)}::jsonb, steps = ${steps}, golden = true, quality_score = ${Math.max(score, 2)} where id = ${r.id}`
  await log(r.id, 'seller', 'golden', { fields, before, after, score_before: r.quality_score, score_after: Math.max(score, 2) }, user.id, str(f, 'note', 500))
  revalidatePath(`/sell/${r.id}`)
  redirect(`/sell/${r.id}`)
}
