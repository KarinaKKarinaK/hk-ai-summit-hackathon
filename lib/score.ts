// Shared by browser (live feedback while uploading) and server (final score).
// No imports, so node can run score.test.mjs against it directly.

export const LABELS = {
  perspective: ['Egocentric', 'Exocentric'],
  task: ['Assembly', 'Repair', 'Welding', 'Wiring', 'Plumbing', 'Carpentry', 'Machining', 'Sewing', 'Painting', 'Cooking', 'Cleaning', 'Folding'],
  industry: ['Automotive', 'Construction', 'Electrical', 'Manufacturing', 'HVAC', 'Textile', 'Food', 'Domestic', 'Landscaping'],
  device: ['Phone', 'Head-mounted camera', 'Smart glasses', 'Action camera'],
} as const

export type Labels = { perspective?: string; task?: string; industry?: string; device?: string; tools?: string[] }

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

export const BASE_RATE = 20 // USD/h used until a task has bids
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

/** Buyer price for one clip: market rate x hours x quality x seller experience. Floor of 5. */
export function listPrice(rate: number, minutes: number, score: number, years = 0): number {
  return Math.max(5, Math.round(rate * (minutes / 60) * (score / 4) * tier(years).mult))
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

export function packages(price: number) {
  return [
    { key: 'raw', name: 'Raw', price, what: 'Original footage only.' },
    { key: 'processed', name: 'Processed', price: price * 2, what: 'Labels, step list, quality report and hand-pose episode file. No raw footage.' },
    { key: 'both', name: 'Raw + processed', price: Math.round(price * 2.6), what: 'Everything.' },
  ]
}
