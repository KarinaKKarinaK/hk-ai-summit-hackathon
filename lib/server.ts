import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import { LABELS, BASE_RATE, marketRate, listPrice, nearDuplicate, reputation, GOLDEN_MULT, type LabelSet, type LabelSets, type Market, cents } from './score'

// Lazy so the build does not need DATABASE_URL.
export const sql = ((s: TemplateStringsArray, ...v: unknown[]) => neon(process.env.DATABASE_URL!)(s, ...v)) as NeonQueryFunction<false, false>

export function hash(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

export function verify(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex'))
}

const MONTH = 60 * 60 * 24 * 30

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex')
  await sql`insert into sessions (token, user_id, expires) values (${token}, ${userId}, now() + interval '30 days')`
  ;(await cookies()).set('sid', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: MONTH })
}

export const getUser = cache(async () => {
  const token = (await cookies()).get('sid')?.value
  if (!token) return null
  const rows = await sql`select u.id, u.email, u.name, u.role, u.org, u.trade, u.years, u.credential
    from sessions s join users u on u.id = s.user_id where s.token = ${token} and s.expires > now()`
  return rows[0] ?? null
})

export async function requireUser() {
  return (await getUser()) ?? redirect('/login')
}

/**
 * Evidence trail. Append-only: nothing in the app updates or deletes an event.
 * kinds: observed (device) | proposed (model) | changed, kept (reviewer) | priced (market) | ask (seller) | accepted, passed (buyer)
 */
export async function log(uploadId: string, actor: 'device' | 'model' | 'seller' | 'buyer' | 'market', kind: string, data: object, actorId: string | null = null, note = '') {
  const n = note.slice(0, 500) || null
  // Each event's hash covers the one before it, so an edited or deleted event breaks the chain.
  // Hashed in SQL over the stored jsonb text so /api/provenance can recompute it exactly.
  // ponytail: two events written in the same instant could share a parent. Lock per upload if that ever matters.
  await sql`insert into events (upload_id, actor, actor_id, kind, data, note, hash)
    select ${uploadId}::uuid, ${actor}::text, ${actorId}::uuid, ${kind}::text, x.d, ${n}::text,
      encode(sha256(convert_to(coalesce((select hash from events where upload_id = ${uploadId}::uuid order by id desc limit 1), '')
        || ${actor}::text || ${kind}::text || x.d::text || coalesce(${n}::text, ''), 'UTF8')), 'hex')
    from (select ${JSON.stringify(data)}::jsonb as d) x`
}

/** Demand-weighted average rate across trades with live bids: the headline number of the Guild Index. */
export function guildIndex(market: Record<string, TaskMarket>): number {
  const live = Object.values(market).filter((m) => m.demand > 0)
  const w = live.reduce((a, m) => a + m.demand, 0)
  return w ? Math.round((live.reduce((a, m) => a + m.rate * m.demand, 0) / w) * 100) / 100 : BASE_RATE
}

export async function getReputation(sellerId: string) {
  const [r] = await sql`select
    (select count(*)::int from uploads where seller_id = ${sellerId} and status = 'scored' and duplicate_of is null and quality_score >= 2) as clips,
    (select count(*)::int from uploads where seller_id = ${sellerId} and duplicate_of is not null) as duplicates,
    (select count(*)::int from events e join uploads u on u.id = e.upload_id where u.seller_id = ${sellerId} and e.kind = 'accepted') as accepted,
    (select count(*)::int from events e join uploads u on u.id = e.upload_id where u.seller_id = ${sellerId} and e.kind = 'passed') as passed`
  const counts = r as { clips: number; duplicates: number; accepted: number; passed: number }
  return { ...counts, score: reputation(counts) }
}

export type TaskMarket = Market & { rate: number; listings: number }

/** Live order book per task: bids are open calls, asks are listings, last is the latest sale. */
export const getMarket = cache(async (): Promise<Record<string, TaskMarket>> => {
  const [bids, asks, sales] = await Promise.all([
    sql`select task, sum(hours)::float as demand, (sum(hours * rate) / nullif(sum(hours), 0))::float as bid, max(rate)::float as top
      from calls where task is not null and hours > 0 group by task`,
    sql`select labels->>'task' as task, (sum(minutes) / 60)::float as supply, count(*)::int as n
      from uploads where status = 'scored' and quality_score >= 2 and withdrawn_at is null group by 1`,
    sql`select task, rate::float as rate, i from (
        select u.labels->>'task' as task, p.rate, row_number() over (partition by u.labels->>'task' order by p.created_at desc) as i
        from purchases p join uploads u on u.id = p.upload_id where p.rate is not null) x where i <= 2`,
  ])
  const out: Record<string, TaskMarket> = {}
  for (const task of LABELS.task) {
    const b = bids.find((r) => r.task === task), a = asks.find((r) => r.task === task)
    const m: Market = {
      demand: b?.demand ?? 0, supply: a?.supply ?? 0, bid: b?.bid ?? 0, topBid: b?.top ?? 0,
      last: sales.find((r) => r.task === task && r.i == 1)?.rate ?? null,
      prev: sales.find((r) => r.task === task && r.i == 2)?.rate ?? null,
    }
    out[task] = { ...m, rate: marketRate(m), listings: a?.n ?? 0 }
  }
  return out
})

/** What a buyer pays for the raw package: the seller's ask if they set one, else the live market price. */
export function priceOf(r: Record<string, any>, market: Record<string, TaskMarket>): number {
  return r.ask ?? cents(listPrice(market[r.labels?.task ?? '']?.rate ?? BASE_RATE, r.minutes, r.quality_score, r.years ?? 0) * (r.golden ? GOLDEN_MULT : 1))
}

/** Trust boundary for the duplicate check inputs. */
export function cleanHashes(b: any): { fingerprint: string | null; hashes: string[] } {
  return {
    fingerprint: typeof b?.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(b.fingerprint) ? b.fingerprint : null,
    hashes: (Array.isArray(b?.hashes) ? b.hashes : []).filter((h: unknown) => typeof h === 'string' && /^[0-9a-f]{16}$/.test(h)).slice(0, 6),
  }
}

/** Has this clip been uploaded before, by anyone? Exact file match first, then look-alike frames. */
export async function findDuplicate(fingerprint: string | null, hashes: string[], userId?: string) {
  if (!fingerprint && !hashes.length) return null
  // ponytail: linear scan over every clip. Fine to a few thousand clips, then an LSH or pgvector index.
  const rows = await sql`select id, seller_id, fingerprint, phash from uploads where duplicate_of is null and (fingerprint is not null or phash is not null)`
  for (const r of rows) {
    const kind = fingerprint && r.fingerprint === fingerprint ? 'exact' : nearDuplicate(hashes, r.phash ?? []) ? 'near' : null
    if (kind) return { id: r.id as string, kind, own: r.seller_id === userId }
  }
  return null
}

/** Trust boundary for the open-source model outputs computed on the seller's device. */
export function cleanLabelsets(b: any): LabelSets {
  const set = (v: unknown): LabelSet =>
    (Array.isArray(v) ? v : [])
      .filter((x) => typeof x?.name === 'string' && typeof x.confidence === 'number' && isFinite(x.confidence))
      .slice(0, 10)
      .map((x) => ({ name: x.name.trim().slice(0, 40), confidence: Math.min(1, Math.max(0, x.confidence)), frames: Math.min(6, Math.max(1, Math.round(Number(x.frames) || 1))) }))
  const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)
  return { objects: set(b?.objects), scene: set(b?.scene), hands: { coverage: n(b?.hands?.coverage), confidence: n(b?.hands?.confidence) } }
}
