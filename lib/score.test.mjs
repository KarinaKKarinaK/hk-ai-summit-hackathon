// node --test lib/score.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { technical, completeness, finalScore, payout, checks, marketRate, signal, listPrice, dhash, hamming, nearDuplicate, matchesCall, reputation } from './score.ts'

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
  assert.equal(marketRate(), 20) // no bids, no listings: base rate
  const scarce = marketRate({ bid: 50, demand: 200, supply: 10 })
  const glut = marketRate({ bid: 50, demand: 10, supply: 200 })
  assert.ok(scarce > 50 && glut < 50 && scarce <= 70 && glut >= 30) // moves with demand, bounded 0.6x..1.4x
  assert.equal(signal({ demand: 200, supply: 10 }), 'Undersupplied')
  // one absurd sale cannot more than 1.3x the market
  assert.ok(marketRate({ bid: 50, demand: 100, supply: 100, last: 100000 }) <= 50 * 1.3 + 0.01)
  assert.ok(listPrice(60, 60, 4, 12) > listPrice(60, 60, 4, 0)) // experience prices higher
  assert.equal(listPrice(60, 0.1, 1), 5) // floor
  assert.equal(payout(100), 80)
})
