// Demo account for the pitch: Mr. Wong, an electrician with a month of sales behind him.
// Sample data, like the other seeded sellers. Safe to rerun: it replaces his clips and sales.
//   node --env-file=.env.local scripts/seed-wong.mjs <password>
import { neon } from '@neondatabase/serverless'
import { randomBytes, scryptSync } from 'node:crypto'

const sql = neon(process.env.DATABASE_URL)
const password = process.argv[2]
if (!password || password.length < 8) throw new Error('Pass a password of 8 or more characters as the first argument')
const salt = randomBytes(16).toString('hex'), pass = `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
const EMAIL = 'wong@guild.demo', YEARS = 14

const [{ id }] = await sql`insert into users (email, name, pass, role, trade, years, credential)
  values (${EMAIL}, 'Mr. Wong', ${pass}, 'seller', 'Electrician', ${YEARS}, 'Registered electrical worker')
  on conflict (email) do update set pass = excluded.pass, name = excluded.name, trade = excluded.trade, years = excluded.years, credential = excluded.credential returning id`
const old = await sql`select id from uploads where seller_id = ${id}`
for (const u of old) {
  await sql`delete from purchases where upload_id = ${u.id}`
  await sql`delete from events where upload_id = ${u.id}`
}
await sql`delete from uploads where seller_id = ${id}`

// [title, task, industry, tools, score, minutes, golden, description]
const clips = [
  ['Consumer unit rewire, three-bedroom flat', 'Wiring', 'Electrical', ['Wire stripper', 'Insulated screwdriver', 'Multimeter'], 5, 42, true, 'Old board out, new board in, every circuit tested and labelled.'],
  ['Socket and switch second fix', 'Wiring', 'Electrical', ['Wire stripper', 'Voltage tester'], 5, 31, true, 'Strip, terminate and fix twelve outlets.'],
  ['Cable pulling through ceiling trunking', 'Wiring', 'Construction', ['Fish tape', 'Cable cutter'], 4, 36, false, 'Long runs above a shop fit-out, two hands on the cable throughout.'],
  ['Three-phase motor isolator install', 'Wiring', 'Manufacturing', ['Torque screwdriver', 'Multimeter'], 5, 28, true, 'Gland, terminate and test an isolator on a workshop machine.'],
  ['LED downlight replacement', 'Repair', 'Domestic', ['Voltage tester', 'Wire stripper'], 4, 18, false, 'Six fittings swapped, driver wiring shown close up.'],
  ['Fault finding on a tripping circuit', 'Repair', 'Electrical', ['Multimeter', 'Insulation tester'], 5, 33, true, 'Split the circuit, test each leg, find and fix the damaged cable.'],
  ['Conduit bending and fixing', 'Assembly', 'Construction', ['Conduit bender', 'Hacksaw'], 4, 24, false, 'Offsets and saddles to measured marks, fixed to block wall.'],
  ['Distribution board labelling and test sheet', 'Wiring', 'Electrical', ['Multimeter', 'Label printer'], 4, 21, false, 'Circuit by circuit test, results written up on camera.'],
  ['EV charger wall install', 'Assembly', 'Electrical', ['Drill', 'Torque screwdriver', 'Multimeter'], 5, 39, false, 'Mount, cable, terminate and commission a 7 kW unit.'],
  ['Emergency light battery swap, failure and retry', 'Repair', 'Construction', ['Screwdriver', 'Voltage tester'], 3, 14, false, 'First fitting fails the test, second attempt passes.'],
]
const RATE = { Wiring: 11, Repair: 9.5, Assembly: 9.5 } // USD per hour, close to the live board
const buyers = (await sql`select id from users where role = 'buyer' and email like '%@seed.guild' order by created_at`).map((b) => b.id)
if (!buyers.length) throw new Error('Run scripts/init-db.mjs first: no seed buyers found')

let seed = 7
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648) // fixed sequence, same data every run
let sold = 0
for (const [i, [title, task, industry, tools, score, minutes, golden, description]] of clips.entries()) {
  // rate x length x score x master tier, 30% more when golden: the same sum the app does
  const price = Math.max(1, Math.round(RATE[task] * (minutes / 60) * (score / 4) * 1.5 * (golden ? 1.3 : 1)))
  const labels = { task, industry, perspective: 'Egocentric', device: 'Phone', tools, outcome: i === 9 ? 'Failure and recovery' : 'Completed' }
  const [u] = await sql`insert into uploads (seller_id, title, status, quality_score, labels, description, minutes, price, golden, capture, created_at)
    values (${id}, ${title}, 'scored', ${score}, ${JSON.stringify(labels)}::jsonb, ${description}, ${minutes}, ${price}, ${golden}, 'in-app', now() - make_interval(days => ${50 - i * 3}))
    returning id`
  // better clips sell more often. Most sales fall in the last month, a few before it.
  const n = Math.round((score - 2) * 2 + rnd() * 4)
  for (let k = 0; k < n; k++) {
    const ago = rnd() < 0.8 ? rnd() ** 1.6 * 29 : 30 + rnd() * 14
    await sql`insert into purchases (buyer_id, upload_id, package, price, created_at)
      values (${buyers[Math.floor(rnd() * buyers.length)]}, ${u.id}, 'byo', ${price}, now() - make_interval(hours => ${Math.round(ago * 24)}))`
    sold++
  }
}
console.log(`Mr. Wong: ${clips.length} clips, ${sold} sales. Sign in with ${EMAIL}`)
