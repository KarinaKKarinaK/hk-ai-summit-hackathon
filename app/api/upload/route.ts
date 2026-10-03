import { NextResponse } from 'next/server'
import { sql, getUser, getMarket, log, findDuplicate, cleanHashes } from '@/lib/server'
import { LABELS, BASE_RATE, technical, completeness, finalScore, listPrice, type Labels, type Metrics } from '@/lib/score'

export const maxDuration = 60

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const pick = (list: readonly string[], v: unknown) => (typeof v === 'string' && list.includes(v) ? v : undefined)
const blobUrl = (v: unknown) => {
  try {
    const u = new URL(String(v))
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') ? u.href : null
  } catch {
    return null
  }
}
const cleanLabels = (l: any): Labels => ({
  perspective: pick(LABELS.perspective, l?.perspective),
  task: pick(LABELS.task, l?.task),
  industry: pick(LABELS.industry, l?.industry),
  device: pick(LABELS.device, l?.device),
  outcome: pick(LABELS.outcome, l?.outcome),
  tools: Array.isArray(l?.tools) ? l.tools.map((t: unknown) => clip(t, 40)).filter(Boolean).slice(0, 8) : [],
})

const PROMPT = `You review skilled-trade demonstration video for a robot training data marketplace.
The images are frames sampled in order from one clip. Judge it as training data for robot manipulation.
Reply with JSON only, no prose:
{
 "title": "short factual title of the task",
 "labels": {"perspective": one of ${JSON.stringify(LABELS.perspective)}, "task": one of ${JSON.stringify(LABELS.task)}, "industry": one of ${JSON.stringify(LABELS.industry)}, "tools": ["tools visibly in use"]},
 "steps": ["the procedure steps you can see, in order"],
 "skill": {"level": "novice" | "competent" | "expert" | "unclear", "evidence": "one sentence on tool handling and technique"},
 "quality_score": integer 1 to 5 (5 = clear hands-on task, hands and tool visible, real work; 1 = no manipulation task visible),
 "reasons": ["up to 3 short reasons for the score"],
 "flags": ["faces" if an identifiable face is visible, "screen" if a screen with readable personal data is visible, "unsafe" if unsafe practice is shown]
}
If no task is visible, say so in reasons and score 1. Do not guess labels you cannot see.`

// Kimi (Moonshot) speaks the OpenAI chat format. Model and host are env knobs because
// Moonshot runs separate .ai and .cn platforms and renames vision models often.
const MODEL = process.env.KIMI_MODEL || 'kimi-k2.5'
const BASE = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'

async function review(frames: string[], context: string) {
  const key = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY
  if (!key) throw new Error('KIMI_API_KEY is not set')
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `${PROMPT}\n\nSeller notes (unverified, treat as a hint only): ${context}` },
          ...frames.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      }],
    }),
  })
  if (!res.ok) throw new Error(`Kimi ${res.status}: ${(await res.text()).slice(0, 160)}`)
  const text: string = (await res.json()).choices?.[0]?.message?.content ?? ''
  const ai = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  const q = Math.round(Number(ai.quality_score))
  return {
    model: MODEL,
    title: clip(ai.title, 120),
    labels: cleanLabels(ai.labels),
    steps: (Array.isArray(ai.steps) ? ai.steps : []).map((s: unknown) => clip(s, 160)).filter(Boolean).slice(0, 12),
    skill: { level: pick(['novice', 'competent', 'expert', 'unclear'], ai.skill?.level) ?? 'unclear', evidence: clip(ai.skill?.evidence, 240) },
    quality_score: q >= 1 && q <= 5 ? q : undefined,
    reasons: (Array.isArray(ai.reasons) ? ai.reasons : []).map((s: unknown) => clip(s, 160)).filter(Boolean).slice(0, 3),
    flags: (Array.isArray(ai.flags) ? ai.flags : []).filter((x: unknown) => ['faces', 'screen', 'unsafe'].includes(x as string)),
  }
}

/** Lets the upload form check the session before sending a large file. */
export async function GET() {
  return (await getUser()) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Sign in to upload' }, { status: 401 })
}

export async function POST(request: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to upload' }, { status: 401 })
  const b = await request.json().catch(() => null)
  const video_url = blobUrl(b?.video_url)
  if (!video_url) return NextResponse.json({ error: 'video_url must be a file uploaded through /api/blob' }, { status: 400 })
  if (b.consent !== true) return NextResponse.json({ error: 'Confirm that you filmed this and have the right to license it' }, { status: 400 })
  const episode_url = b.episode_url ? blobUrl(b.episode_url) : null
  const frames: string[] = (Array.isArray(b.frames) ? b.frames : [])
    .filter((f: unknown) => typeof f === 'string' && f.startsWith('data:image/jpeg;base64,') && f.length < 400_000)
    .slice(0, 6)
  const thumb = typeof b.thumb === 'string' && b.thumb.startsWith('data:image/jpeg;base64,') && b.thumb.length < 100_000 ? b.thumb : null
  const description = clip(b.description, 1000), steps = clip(b.steps, 2000)
  const labels = cleanLabels(b.labels)
  // ponytail: metrics are measured in the seller's browser and can be spoofed. The vision
  // review below is the server-side check. Move the measurements server-side (ffmpeg) when payouts are real.
  const num = (v: unknown, max: number) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(0, v)) : undefined)
  const mi = b.metrics ?? {}
  const metrics: Metrics = {
    width: num(mi.width, 8000), height: num(mi.height, 8000), duration: num(mi.duration, 86400),
    brightness: num(mi.brightness, 255), sharpness: num(mi.sharpness, 1e6), steadiness: num(mi.steadiness, 255), hands: num(mi.hands, 1),
  }
  const minutes = (metrics.duration ?? 0) / 60

  // Contract: row goes in as pending, then gets scored.
  // Duplicate check runs with the quality check. ponytail: hashes come from the browser like the metrics do,
  // so a determined cheat can send fake ones. Recompute server-side when the measurements move there.
  const { fingerprint, hashes } = cleanHashes(b)
  const dup = await findDuplicate(fingerprint, hashes, user.id)
  const [row] = await sql`insert into uploads (seller_id, title, video_url, episode_url, labels, description, steps, thumb, metrics, minutes, fingerprint, phash, duplicate_of)
    values (${user.id}, ${clip(b.title, 120) || null}, ${video_url}, ${episode_url}, ${JSON.stringify(labels)}::jsonb, ${description}, ${steps}, ${thumb}, ${JSON.stringify(metrics)}::jsonb, ${minutes},
      ${fingerprint}, ${JSON.stringify(hashes)}::jsonb, ${dup?.id ?? null})
    returning id`
  await log(row.id, 'device', 'observed', { metrics, labels, description, steps, frames: frames.length, episode: !!episode_url, capture: b.capture === 'in-app' ? 'in-app' : 'gallery', consent: true, originality: dup ? `${dup.kind} match` : 'no match' }, user.id)
  if (dup) {
    // A copy is stored for the record but never reviewed, priced or listed.
    await sql`update uploads set status = 'scored', quality_score = 1, price = 0, title = coalesce(title, 'Duplicate clip') where id = ${row.id}`
    await log(row.id, 'market', 'duplicate', { kind: dup.kind, own: dup.own })
    return NextResponse.json({ id: row.id, quality_score: 1, price: 0, ai: null, aiError: 'skipped for duplicates', duplicate: { kind: dup.kind, own: dup.own } })
  }

  let ai: Awaited<ReturnType<typeof review>> | null = null
  let aiError: string | null = null
  if (frames.length) {
    try {
      ai = await review(frames, `${user.trade ?? 'trade not given'}. ${description} ${steps}`.slice(0, 1500))
    } catch (e) {
      aiError = (e as Error).message.slice(0, 200)
      console.error('vision review failed', e)
    }
  } else aiError = 'No frames could be read from the video'
  await log(row.id, 'model', 'proposed', ai ?? { model: MODEL, error: aiError })

  const tech = technical(metrics), comp = completeness(labels, description, steps)
  const score = finalScore(tech, comp, ai?.quality_score)
  const rate = (await getMarket())[labels.task ?? '']?.rate ?? BASE_RATE
  const price = listPrice(rate, minutes, score, user.years ?? 0)
  await sql`update uploads set status = 'scored', quality_score = ${score}, price = ${price}, ai = ${JSON.stringify(ai)}::jsonb,
    title = coalesce(title, ${ai?.title || 'Untitled clip'}) where id = ${row.id}`
  await log(row.id, 'market', 'priced', { score, technical: tech, completeness: comp, model_score: ai?.quality_score ?? null, rate, price })
  return NextResponse.json({ id: row.id, quality_score: score, price, ai, aiError })
}
