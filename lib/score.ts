// Shared by browser (live feedback while uploading) and server (final score).
// No imports, so node can run score.test.mjs against it directly.

export const LABELS = {
  perspective: ['Egocentric', 'Exocentric', 'Screen'],
  task: ['Assembly', 'Repair', 'Welding', 'Wiring', 'Plumbing', 'Carpentry', 'Machining', 'Sewing', 'Painting', 'Cooking', 'Cleaning', 'Folding', 'Spreadsheet', 'Data entry', 'Software task'],
  industry: ['Automotive', 'Construction', 'Electrical', 'Manufacturing', 'HVAC', 'Textile', 'Food', 'Domestic', 'Landscaping', 'Office'],
  device: ['Phone', 'Head-mounted camera', 'Smart glasses', 'Action camera', 'Computer screen'],
  // Failure and recovery footage is rare and robots need it, so it is a first-class label.
  outcome: ['Completed', 'Failed then recovered', 'Failed'],
} as const

// Stand-in photos for listings without their own thumbnail. Files and credits are in public/tasks.
const TASK_PHOTOS = ['assembly', 'carpentry', 'cleaning', 'folding', 'machining', 'plumbing', 'repair', 'sewing', 'welding', 'wiring']
const SCREEN_TASKS = ['spreadsheet', 'data entry', 'software task'] // these share one drawn picture of a spreadsheet
export const taskPhoto = (task?: string): string | null => {
  const t = task?.toLowerCase() ?? ''
  return SCREEN_TASKS.includes(t) ? '/tasks/spreadsheet.svg' : TASK_PHOTOS.includes(t) ? `/tasks/${t}.jpg` : null
}

export type Labels = { perspective?: string; task?: string; industry?: string; device?: string; tools?: string[]; outcome?: string }

/** Does a clip meet a buyer's bounty spec? Used when a seller fills a bid, on the page and again on the server. */
export function matchesCall(c: Record<string, any>, l: Labels, minutes: number): boolean {
  return (!c.task || c.task === l.task) && (!c.industry || c.industry === l.industry) && (!c.perspective || c.perspective === l.perspective) &&
    (!c.min_seconds || minutes * 60 >= c.min_seconds) && (!c.wants_failures || /^Failed/.test(l.outcome ?? ''))
}

/** Contributor reputation 0..100: buyer acceptance, originality, track record. A new seller starts at 55. */
export function reputation(r: { clips: number; duplicates: number; accepted: number; passed: number }): number {
  const decisions = r.accepted + r.passed, total = r.clips + r.duplicates
  return Math.round(100 * (0.5 * (decisions ? r.accepted / decisions : 0.5) + 0.3 * (total ? r.clips / total : 1) + 0.2 * Math.min(1, r.clips / 10)))
}

// ---- Authenticity. Recording happens in the app, and a live session leaves traces a pre-made video cannot. ----

export const HOLD_DAYS = 14 // payouts are held this long so fraud found later can be clawed back. Shown in the UI, no payments yet.

// Calibration knobs for finger counting. Loosen if real hands fail the challenge.
const FINGER_UP = 1.1, THUMB_OUT = 1.05

/** Fingers held up, from the 21 hand landmarks. Drives the live "show N fingers" challenge. */
export function countFingers(lm: { x: number; y: number }[]): number {
  const d = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y)
  // a finger is up when its tip is further from the wrist than its middle joint
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]].filter(([tip, pip]) => d(tip, 0) > d(pip, 0) * FINGER_UP).length
  // the thumb is out when its tip is further from the pinky base than its own joint
  return fingers + (d(4, 17) > d(3, 17) * THUMB_OUT ? 1 : 0)
}

/**
 * Was this recorded live in the app? Three traces: the hand-tracking stream covers the video,
 * every challenge was passed, and (on phones) the motion sensors ran alongside.
 * ponytail: the episode is produced in the browser, so a determined cheat can forge it.
 * Upgrade path: device attestation (App Attest, Play Integrity) and C2PA signing.
 */
export function authenticity(ep: any, seconds: number) {
  const frames = Array.isArray(ep?.frames) ? ep.frames.length : 0
  const tracking = seconds > 0 ? Math.min(1, frames / (seconds * 10)) : 0 // 10 tracked frames per second counts as full cover
  const challenges: any[] = Array.isArray(ep?.challenges) ? ep.challenges : []
  const challenge = challenges.length > 0 && challenges.every((c) => c?.passed === true)
  const sensors = (ep?.sensors?.accel?.length ?? 0) >= Math.max(5, seconds * 5) // laptops have none, so this is recorded but not required
  return { tracking: Math.round(tracking * 100) / 100, challenge, sensors, passed: challenge && tracking >= 0.3 }
}

export const RESULT_BONUS = 0.2 // pay on results: share of the price paid again to the seller when the clip improved the buyer's model

export const LICENCE = {
  name: 'Guild training licence v1',
  terms: [
    'The contributor keeps ownership of the footage.',
    'Non-exclusive: the same clip can be licensed to other buyers.',
    'The buyer may train and evaluate commercial robotics and embodied AI models on it.',
    'The buyer may not resell, sublicense or publish the footage itself.',
    'Not licensed for surveillance, biometric identification, or generating likenesses of the people shown.',
    'Perpetual for models already trained. If the contributor withdraws the clip, no new licences are sold.',
  ],
}

export type Metrics = {
  width?: number
  height?: number
  duration?: number // seconds
  brightness?: number // mean luma 0..255
  sharpness?: number // Laplacian variance on a 320px frame
  steadiness?: number // mean abs luma diff between frames 0.15s apart
  hands?: number // share of sampled frames with a hand in view, 0..1
}

export type Check = { key: keyof typeof WEIGHT; label: string; value: string; score: number; tip: string }

// Calibration knobs. Tuned on a handful of phone clips, expect to adjust per device.
const WEIGHT = { hands: 0.3, sharpness: 0.2, lighting: 0.15, resolution: 0.15, steadiness: 0.1, duration: 0.1 }
const SHARP_GOOD = 120, SHARP_OK = 50
const SHAKE_GOOD = 8, SHAKE_OK = 18

export function checks(m: Metrics): Check[] {
  const out: Check[] = []
  if (m.width && m.height) {
    const s = Math.min(m.width, m.height)
    out.push({ key: 'resolution', label: 'Resolution', value: `${m.width}x${m.height}`, score: s >= 1080 ? 1 : s >= 720 ? 0.75 : s >= 480 ? 0.4 : 0.1, tip: 'Record at 1080p or higher.' })
  }
  if (m.duration != null) {
    out.push({ key: 'duration', label: 'Length', value: `${Math.round(m.duration)}s`, score: m.duration >= 30 ? 1 : m.duration >= 10 ? 0.6 : 0.2, tip: 'Film one full task start to finish, 30 seconds or more.' })
  }
  if (m.brightness != null) {
    const b = m.brightness
    out.push({ key: 'lighting', label: 'Lighting', value: b < 80 ? 'Dark' : b > 190 ? 'Bright' : 'Good', score: b >= 80 && b <= 190 ? 1 : b >= 50 && b <= 220 ? 0.6 : 0.2, tip: b < 80 ? 'Too dark. Add light on the work area.' : 'Overexposed. Avoid direct glare.' })
  }
  if (m.sharpness != null) {
    out.push({ key: 'sharpness', label: 'Sharpness', value: m.sharpness >= SHARP_GOOD ? 'Sharp' : m.sharpness >= SHARP_OK ? 'Soft' : 'Blurry', score: m.sharpness >= SHARP_GOOD ? 1 : m.sharpness >= SHARP_OK ? 0.6 : 0.2, tip: 'Clean the lens and keep the work in focus.' })
  }
  if (m.steadiness != null) {
    out.push({ key: 'steadiness', label: 'Camera steadiness', value: m.steadiness < SHAKE_GOOD ? 'Steady' : m.steadiness < SHAKE_OK ? 'Some shake' : 'Shaky', score: m.steadiness < SHAKE_GOOD ? 1 : m.steadiness < SHAKE_OK ? 0.6 : 0.2, tip: 'Mount the phone on your chest or head, or use a stand.' })
  }
  if (m.hands != null) {
    out.push({ key: 'hands', label: 'Hands in frame', value: `${Math.round(m.hands * 100)}%`, score: Math.min(1, m.hands / 0.8), tip: 'Keep both hands and the tool inside the frame.' })
  }
  return out
}

/** Weighted mean of whichever checks are available so far, 0..1. */
export function technical(m: Metrics): number {
  const cs = checks(m)
  const w = cs.reduce((a, c) => a + WEIGHT[c.key], 0)
  return w ? cs.reduce((a, c) => a + c.score * WEIGHT[c.key], 0) / w : 0
}

export function labelCount(l: Labels): number {
  return [l.perspective, l.task, l.industry, l.device, l.tools?.length].filter(Boolean).length
}

/** Labels plus description plus step list, 0..1. */
export function completeness(l: Labels, description = '', steps = ''): number {
  return (labelCount(l) + (description.trim().length >= 20 ? 1 : 0) + (steps.trim().length >= 20 ? 1 : 0)) / 7
}

/** 1..5. `ai` is the vision model's own 1..5 content score, when we have it. */
export function finalScore(tech: number, comp: number, ai?: number): number {
  const x = ai ? 0.4 * tech + 0.2 * comp + 0.4 * ((ai - 1) / 4) : 0.6 * tech + 0.4 * comp
  return Math.min(5, Math.max(1, Math.round(1 + 4 * x)))
}

/** Skilled labour pays more: experienced tradespeople get a multiplier. */
export function tier(years = 0): { name: string; mult: number } {
  return years >= 10 ? { name: 'Master', mult: 1.5 } : years >= 3 ? { name: 'Journeyman', mult: 1.25 } : { name: 'Apprentice', mult: 1 }
}

// ---- Market pricing. One market per task, priced in USD per hour of par (score 4) footage. ----

export const BASE_RATE = 5 // USD/h used until a task has bids
export const SELLER_SHARE = 0.8 // seller keeps 80% of every sale

/** demand = hours buyers have open calls for, supply = hours listed, bid = volume-weighted bid USD/h, last = last sale USD/h */
export type Market = { demand: number; supply: number; bid: number; topBid: number; last: number | null; prev: number | null }

/** 0 = glut, 1 = nothing listed against real demand. */
export function pressure(m?: Partial<Market>): number {
  const d = m?.demand ?? 0, s = m?.supply ?? 0
  return d + s ? d / (d + s) : 0.5
}

export function signal(m?: Partial<Market>): string {
  const p = pressure(m)
  return p > 0.6 ? 'Undersupplied' : p < 0.4 ? 'Oversupplied' : 'Balanced'
}

/**
 * The dynamic price. Starts from what buyers bid, moves 0.6x to 1.4x with scarcity,
 * then leans 30% toward the last real sale. The last sale is clamped to 0.5x..2x so
 * one odd trade (or a seller's inflated ask) cannot swing the market.
 */
export function marketRate(m?: Partial<Market>): number {
  const rate = (m?.bid || BASE_RATE) * (0.6 + 0.8 * pressure(m))
  const last = m?.last ? Math.min(rate * 2, Math.max(rate * 0.5, m.last)) : rate
  return Math.round((0.7 * rate + 0.3 * last) * 100) / 100
}

/** A price in dollars and cents, never below one cent. */
export const cents = (x: number) => Math.max(0.01, Math.round(x * 100) / 100)
/** Money for display: cents under 100 dollars, whole dollars above. */
export const money = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2))

/**
 * Buyer price for one clip: market rate x hours x quality x seller experience.
 * No per-clip floor: published collection costs are 15 to 40 USD per hour of footage, so a one-minute clip is worth cents.
 */
export function listPrice(rate: number, minutes: number, score: number, years = 0): number {
  return cents(rate * (minutes / 60) * (score / 4) * tier(years).mult)
}

export function payout(price: number): number {
  return Math.round(price * SELLER_SHARE * 100) / 100
}

// ---- Duplicate check. A perceptual hash per sampled frame, compared against every clip already uploaded. ----

// Calibration knobs: how many of 64 bits may differ for two frames to count as the same picture,
// and what share of frames must match for two clips to count as the same clip.
const DUP_BITS = 10
const DUP_SHARE = 0.67

/** 64-bit difference hash of a grayscale frame, as 16 hex chars. Survives re-encoding, resizing and mild colour changes. */
export function dhash(g: ArrayLike<number>, w: number, h: number): string {
  const cell = (cx: number, cy: number) => {
    const x0 = Math.floor((cx * w) / 9), x1 = Math.floor(((cx + 1) * w) / 9), y0 = Math.floor((cy * h) / 8), y1 = Math.floor(((cy + 1) * h) / 8)
    let s = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (s += g[y * w + x]), n++
    return s / (n || 1)
  }
  let hex = ''
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (cell(x, y) > cell(x + 1, y) ? 1 : 0)
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

export function hamming(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < 16; i += 2) for (let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16); x; x >>= 1) d += x & 1
  return d
}

/**
 * Same clip if most frames, sampled at the same relative positions, look alike.
 * ponytail: a trimmed or mirrored copy shifts the sample points and gets through.
 * Upgrade path: hash more frames and align them in time, or compare video embeddings.
 */
export function nearDuplicate(a: string[], b: string[]): boolean {
  const flat = (h: string) => /^(0+|f+)$/.test(h) // a black or blank frame matches everything, so it proves nothing
  let hit = 0, n = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (flat(a[i]) || flat(b[i])) continue
    n++
    if (hamming(a[i], b[i]) <= DUP_BITS) hit++
  }
  return n >= 3 && hit / n >= DUP_SHARE
}

// Why a buyer took or left a clip. Stored on the evidence trail.
export const ACCEPT_REASONS = ['Matches our task spec', 'Hands and tool clearly visible', 'Quality score', 'Seller experience in the trade', 'Step list is usable', 'Has hand-pose episode', 'Price']
export const PASS_REASONS = ['Wrong task', 'Quality too low', 'Labels look wrong', 'Too short', 'Face or private data visible', 'Price too high']

// ---- Labelling options. The buyer always pays for the raw data. Labelling is a separate, optional line. ----

export const GOLDEN_MULT = 1.3 // a clip whose labels the seller has checked by hand lists for this much more

/** One model's output over the sampled frames: label, mean confidence, and how many frames it appeared in. */
export type LabelSet = { name: string; confidence: number; frames: number }[]
export type LabelSets = { objects?: LabelSet; scene?: LabelSet; hands?: { coverage: number; confidence: number } }

// fee = share of the raw data price. The on-device open-source checks come free with every option.
export const LABELLING = [
  { key: 'byo', name: 'Bring your own labelling', fee: 0, what: 'The recording, motion data and the free on-device checks. Label it in your own pipeline.' },
  { key: 'llm', name: 'LLM labelling (Kimi)', fee: 0.15, what: 'Task, step list, skill level and privacy flags from a vision language model.' },
  { key: 'verified', name: 'Guild verified', fee: 0.6, what: 'Model labels checked by a person, field by field. Our most accurate option.' },
] as const

/** Why an option cannot be bought for this clip, or null if it can. Checked on the page and again at purchase. */
export function unavailable(key: string, clip: { ai?: unknown; golden?: boolean | null; labelsets?: LabelSets | null }): string | null {
  if (key === 'oss-objects' && !clip.labelsets?.objects?.length) return 'The detector found nothing on this clip'
  if (key === 'oss-scene' && !clip.labelsets?.scene?.length) return 'Not run on this clip'
  if (key === 'llm' && !clip.ai) return 'The LLM review has not run on this clip'
  if (key === 'verified' && !clip.golden) return 'Nobody has checked this clip by hand yet'
  return null
}

/** Each option priced for one clip: the raw data price plus the labelling fee. */
export function packages(price: number) {
  return LABELLING.map((o) => ({ ...o, labelling: Math.round(price * o.fee * 100) / 100, price: Math.round(price * (1 + o.fee) * 100) / 100 }))
}
