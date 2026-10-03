import { NextResponse } from 'next/server'
import { sql, getUser } from '@/lib/server'
import { LICENCE } from '@/lib/score'

// Audit-ready provenance for one clip: who, how captured, what rights, and the full trail with a
// hash chain the reader can recheck. Buyer decisions appear without the buyer's private reasons.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const user = await getUser()
  const [r] = await sql`select u.id, u.seller_id, u.title, u.created_at, u.status, u.quality_score, u.withdrawn_at, u.fingerprint, u.duplicate_of, u.episode_url is not null as has_episode,
      s.trade, s.years, s.credential, s.verified from uploads u join users s on s.id = u.seller_id where u.id = ${id}`
  if (!r || (r.seller_id !== user?.id && (r.status !== 'scored' || r.quality_score < 2 || r.withdrawn_at))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Recompute every hash from the stored row and the previous hash.
  const events = await sql`select kind, actor, data, note, created_at, hash,
      hash = encode(sha256(convert_to(coalesce(lag(hash) over (order by id), '') || actor || kind || data::text || coalesce(note, ''), 'UTF8')), 'hex') as ok
    from events where upload_id = ${id} order by id`
  const observed = events.find((e) => e.kind === 'observed')?.data ?? {}
  const priv = (k: string) => ['accepted', 'passed', 'result'].includes(k)
  return NextResponse.json({
    certificate: 'Guild provenance certificate v1',
    issued: new Date().toISOString(),
    clip: { id: r.id, title: r.title, uploaded: r.created_at, file_fingerprint_sha256: r.fingerprint, has_hand_pose_episode: r.has_episode, quality_score: r.quality_score },
    capture: { method: observed.capture ?? 'unknown', measured_on_device: observed.metrics ?? null },
    originality: { check: 'file fingerprint and per-frame perceptual hash against all prior uploads', result: r.duplicate_of ? 'duplicate' : observed.originality ?? 'not checked' },
    contributor: { trade: r.trade, years: r.years, credential: r.credential, credential_status: r.verified ? 'verified by Guild' : 'self-declared' },
    rights: { contributor_declared_ownership_and_consent: observed.consent === true, licence: LICENCE },
    trail: events.map((e) => ({ kind: e.kind, actor: e.actor, at: e.created_at, hash: e.hash, ...(priv(e.kind) ? {} : { data: e.data, note: e.note }) })),
    chain: { events: events.length, intact: events.length > 0 && events.every((e) => e.ok === true), how_to_verify: 'hash = sha256(previous_hash + actor + kind + data_as_stored_json_text + note)' },
  })
}
