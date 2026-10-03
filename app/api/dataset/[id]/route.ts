import { NextResponse } from 'next/server'
import { sql, getUser } from '@/lib/server'
import { LICENCE } from '@/lib/score'

// What a buyer receives for a bounty: not a folder of videos, a manifest with labels, steps,
// provenance, licence and a fixed train/validation/test split. Only the bounty's owner can fetch it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [c] = await sql`select * from calls where id = ${id} and buyer_id = ${user.id}`
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const clips = await sql`select u.id, u.title, u.video_url, u.episode_url, u.labels, u.steps, u.ai, u.metrics, u.quality_score, u.minutes, p.price, s.trade, s.years, s.verified
    from purchases p join uploads u on u.id = p.upload_id join users s on s.id = u.seller_id where p.call_id = ${id} order by p.created_at`
  // Split by the clip id, so it never changes when more clips arrive. 80 / 10 / 10.
  const split = (uid: string) => { const n = parseInt(uid.slice(-2), 16); return n < 204 ? 'train' : n < 230 ? 'validation' : 'test' }
  const origin = new URL(request.url).origin
  const total = c.hours_total ?? c.hours
  return NextResponse.json(
    {
      dataset: c.title,
      spec: { task: c.task, industry: c.industry, camera: c.perspective, environment: c.environment, objects: c.objects, min_seconds: c.min_seconds, failures_only: c.wants_failures, model_gap: c.weakness },
      progress: { hours_wanted: total, hours_collected: +(total - c.hours).toFixed(2), clips: clips.length },
      licence: LICENCE,
      clips: clips.map((u) => ({
        id: u.id, split: split(u.id), title: u.title, video: u.video_url, hand_pose_episode: u.episode_url, minutes: u.minutes, quality_score: u.quality_score,
        labels: u.labels, steps: u.ai?.steps?.length ? u.ai.steps : (u.steps ?? '').split('\n').filter(Boolean), skill: u.ai?.skill ?? null, flags: u.ai?.flags ?? [],
        capture_metrics: u.metrics, contributor: { trade: u.trade, years: u.years, verified: u.verified }, paid_usd: u.price, provenance: `${origin}/api/provenance/${u.id}`,
      })),
    },
    { headers: { 'content-disposition': `attachment; filename="guild-dataset-${id.slice(0, 8)}.json"` } },
  )
}
