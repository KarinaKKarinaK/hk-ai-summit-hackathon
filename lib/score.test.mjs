// node --test lib/score.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { technical, completeness, finalScore, payout, checks, marketRate, signal, listPrice, dhash, hamming, nearDuplicate, matchesCall, reputation, countFingers, authenticity, packages, unavailable } from './score.ts'

const good = { width: 1920, height: 1080, duration: 60, brightness: 120, sharpness: 200, steadiness: 4, hands: 1 }
const bad = { width: 320, height: 240, duration: 3, brightness: 20, sharpness: 10, steadiness: 40, hands: 0 }
const full = { perspective: 'Egocentric', task: 'Welding', industry: 'Automotive', device: 'Phone', tools: ['MIG welder'] }

test('score', () => {
  assert.equal(technical(good), 1)
  assert.ok(technical(bad) < 0.2)
  assert.equal(technical({}), 0)
  assert.equal(checks({ width: 1280, height: 720 }).length, 1) // partial metrics score live
  assert.equal(completeness(full, 'x'.repeat(20), 'y'.repeat(20)), 1)
  assert.equal(finalScore(1, 1), 5)
  assert.equal(finalScore(0, 0), 1)
  assert.equal(finalScore(1, 1, 1), 3) // a bad content review pulls a perfect clip down
})

test('bounties and reputation', () => {
  const call = { task: 'Welding', perspective: 'Egocentric', min_seconds: 60, wants_failures: true }
  assert.ok(matchesCall(call, { task: 'Welding', perspective: 'Egocentric', outcome: 'Failed then recovered' }, 2))
  assert.ok(!matchesCall(call, { task: 'Welding', perspective: 'Egocentric', outcome: 'Completed' }, 2), 'bounty wants failures')
  assert.ok(!matchesCall(call, { task: 'Welding', perspective: 'Egocentric', outcome: 'Failed' }, 0.5), 'too short')
  assert.ok(matchesCall({}, {}, 0), 'an open bounty takes anything')
  assert.equal(reputation({ clips: 0, duplicates: 0, accepted: 0, passed: 0 }), 55)
  assert.ok(reputation({ clips: 10, duplicates: 0, accepted: 9, passed: 1 }) > 90)
  assert.ok(reputation({ clips: 2, duplicates: 6, accepted: 0, passed: 4 }) < 20, 'copying and rejections sink it')
})

test('labelling options', () => {
  const opts = packages(100)
  assert.deepEqual(opts.map((o) => [o.key, o.price]), [['byo', 100], ['llm', 115], ['verified', 160]])
  const bare = { ai: null, golden: false, labelsets: {} }
  assert.equal(unavailable('byo', bare), null, 'raw data can always be bought')
  assert.ok(unavailable('llm', bare) && unavailable('verified', bare))
  const full = { ai: {}, golden: true, labelsets: { objects: [{ name: 'cup', confidence: 0.8, frames: 3 }], scene: [{ name: 'workshop', confidence: 0.4, frames: 6 }] } }
  assert.ok(opts.every((o) => unavailable(o.key, full) === null))
})

test('authenticity', () => {
  // a flat hand pointing up: wrist at the bottom, tips above the middle joints
  const hand = (up) => {
    const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.9 }))
    const cols = [0.3, 0.42, 0.5, 0.58, 0.66] // thumb, index, middle, ring, pinky
    ;[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]].forEach((f, i) => {
      const open = up.includes(i)
      f.forEach((id, j) => (lm[id] = i === 0 ? { x: open ? 0.45 - j * 0.07 : 0.5 + j * 0.02, y: 0.75 } : { x: cols[i], y: open ? 0.7 - j * 0.1 : j < 2 ? 0.7 - j * 0.1 : 0.72 }))
    })
    return lm
  }
  assert.equal(countFingers(hand([1, 2, 3])), 3)
  assert.equal(countFingers(hand([0, 1, 2, 3, 4])), 5)
  assert.equal(countFingers(hand([])), 0)
  const frames = Array.from({ length: 300 }, (_, i) => ({ t: i * 100 }))
  const ok = [{ t_ms: 3000, prompt: 'show 3 fingers', passed: true }]
  assert.ok(authenticity({ frames, challenges: ok }, 30).passed)
  assert.ok(!authenticity({ frames, challenges: [{ passed: false }] }, 30).passed, 'failed challenge')
  assert.ok(!authenticity({ frames, challenges: [] }, 30).passed, 'no challenge at all')
  assert.ok(!authenticity({ frames: frames.slice(0, 20), challenges: ok }, 30).passed, 'tracking does not cover the video')
  assert.ok(!authenticity(null, 30).passed, 'no episode')
  assert.ok(authenticity({ frames, challenges: ok, sensors: { accel: Array(200).fill([0, 0, 0, 9.8]) } }, 30).sensors)
})

test('duplicates', () => {
  const W = 90, H = 80
  const frame = (seed, noise = 0) => Float32Array.from({ length: W * H }, (_, i) => 128 + 100 * Math.sin((i % W) * 0.07 * seed + Math.floor(i / W) * 0.05 * seed) + noise * Math.sin(i * 12.9898))
  const clip = (seeds, noise) => seeds.map((s) => dhash(frame(s, noise), W, H))
  const a = clip([1, 2, 3, 4, 5, 6])
  assert.equal(a[0].length, 16)
  assert.equal(hamming(a[0], a[0]), 0)
  assert.ok(nearDuplicate(a, clip([1, 2, 3, 4, 5, 6], 6)), 're-encoded copy is caught')
  assert.ok(!nearDuplicate(a, clip([7, 8, 9, 10, 11, 12])), 'a different clip is not')
  const black = Array(6).fill('0'.repeat(16))
  assert.ok(!nearDuplicate(black, black), 'blank frames prove nothing')
})

test('market', () => {
  assert.equal(marketRate(), 5) // no bids, no listings: base rate
  const scarce = marketRate({ bid: 50, demand: 200, supply: 10 })
  const glut = marketRate({ bid: 50, demand: 10, supply: 200 })
  assert.ok(scarce > 50 && glut < 50 && scarce <= 70 && glut >= 30) // moves with demand, bounded 0.6x..1.4x
  assert.equal(signal({ demand: 200, supply: 10 }), 'Undersupplied')
  // one absurd sale cannot more than 1.3x the market
  assert.ok(marketRate({ bid: 50, demand: 100, supply: 100, last: 100000 }) <= 50 * 1.3 + 0.01)
  assert.ok(listPrice(60, 60, 4, 12) > listPrice(60, 60, 4, 0)) // experience prices higher
  assert.equal(listPrice(60, 1, 4), 1) // one minute at 60 USD/h is one dollar: no per-clip floor
  assert.equal(listPrice(60, 0.001, 1), 0.01) // never below a cent
  assert.equal(payout(100), 80)
})
