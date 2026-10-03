// node --env-file=.env.local scripts/init-db.mjs
// Creates tables and seeds demo listings. Safe to run twice.
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const schema = [
  `create table if not exists users (
    id uuid primary key default gen_random_uuid(), email text unique not null, name text not null, pass text,
    role text not null check (role in ('seller','buyer')), org text, trade text, years int default 0, credential text,
    created_at timestamptz default now())`,
  `create table if not exists sessions (
    token text primary key, user_id uuid not null references users(id) on delete cascade, expires timestamptz not null)`,
  `create table if not exists uploads (
    id uuid primary key default gen_random_uuid(), seller_id uuid not null references users(id),
    title text, video_url text, episode_url text, status text not null default 'pending' check (status in ('pending','scored')),
    quality_score int, labels jsonb, description text, steps text, thumb text, metrics jsonb, ai jsonb,
    minutes real default 0, price int default 0, created_at timestamptz default now())`,
  `create table if not exists calls (
    id uuid primary key default gen_random_uuid(), buyer_id uuid not null references users(id), title text not null,
    description text, task text, industry text, hours int default 0, rate int default 0, created_at timestamptz default now())`,
  `create table if not exists purchases (
    id uuid primary key default gen_random_uuid(), buyer_id uuid not null references users(id),
    upload_id uuid not null references uploads(id), package text not null, price int not null, created_at timestamptz default now())`,
  // Evidence trail: observed, proposed, changed, accepted. Append-only.
  `create table if not exists events (
    id bigint generated always as identity primary key, upload_id uuid not null references uploads(id),
    actor text not null, actor_id uuid references users(id), kind text not null, data jsonb, note text, created_at timestamptz default now())`,
  `create index if not exists events_upload on events (upload_id, id)`,
  // Market: seller's own ask (null = follow the market), sale rate in USD/h for the price feed, fractional bid hours.
  `alter table uploads add column if not exists ask int`,
  `alter table purchases add column if not exists rate real`,
  `alter table calls alter column hours type real`,
  // Seller control: a withdrawn clip is off the market. Licences already sold stay valid.
  `alter table uploads add column if not exists withdrawn_at timestamptz`,
  // Duplicate check: exact-file fingerprint, per-frame perceptual hashes, and what the clip matched.
  `alter table uploads add column if not exists fingerprint text`,
  `alter table uploads add column if not exists phash jsonb`,
  `alter table uploads add column if not exists duplicate_of uuid`,
  // Bounty spec, forward contracts, collection progress.
  `alter table calls add column if not exists perspective text`,
  `alter table calls add column if not exists environment text`,
  `alter table calls add column if not exists objects text`,
  `alter table calls add column if not exists min_seconds int`,
  `alter table calls add column if not exists wants_failures boolean default false`,
  `alter table calls add column if not exists weakness text`,
  `alter table calls add column if not exists forward boolean default false`,
  `alter table calls add column if not exists due date`,
  `alter table calls add column if not exists hours_total real`,
  `update calls set hours_total = hours where hours_total is null`,
  // Dataset manifests, pay on results, licence verification, tamper-evident trail.
  `alter table purchases add column if not exists call_id uuid`,
  `alter table purchases add column if not exists bonus int default 0`,
  `alter table users add column if not exists verified boolean default false`,
  `alter table events add column if not exists hash text`,
  // Task requests ask for a number of demos from a minimum number of different people.
  `alter table calls add column if not exists demos int`,
  `alter table calls add column if not exists min_people int`,
  // Labelling: open-source model outputs from the device, the human-checked flag, and the labelling fee on a sale.
  `alter table uploads add column if not exists labelsets jsonb`,
  `alter table uploads add column if not exists golden boolean default false`,
  `alter table purchases add column if not exists fee int default 0`,
]
for (const s of schema) await sql.query(s)

const seeded = await sql`select 1 from users where email like '%@seed.guild'`
if (seeded.length) {
  console.log('schema ok, seed already present')
  process.exit(0)
}

// Seed accounts have no password, so nobody can log in as them.
const people = [
  ['Mei Lin Chan', 'seller', 'Chan Auto Repair', 'Auto mechanic', 14, 'HKVTC Vehicle Mechanic Cert'],
  ['Tomasz Nowak', 'seller', null, 'Electrician', 9, 'Registered Electrical Worker Grade B'],
  ['Aisha Rahman', 'seller', 'Rahman Tailoring', 'Tailor', 22, null],
  ['Diego Alvarez', 'seller', 'Alvarez Fabrication', 'Welder', 6, 'AWS D1.1 Certified'],
  ['Kowloon Robotics', 'buyer', 'Kowloon Robotics', null, 0, null],
  ['Harbour AI Lab', 'buyer', 'Harbour AI Lab', null, 0, null],
  ['Priya Shah', 'seller', null, 'Financial analyst', 7, null],
]
const ids = []
for (const [name, role, org, trade, years, credential] of people) {
  const email = name.toLowerCase().replace(/\W+/g, '.') + '@seed.guild'
  const r = await sql`insert into users (email, name, role, org, trade, years, credential)
    values (${email}, ${name}, ${role}, ${org}, ${trade}, ${years}, ${credential}) returning id`
  ids.push(r[0].id)
}

// [seller, title, task, industry, perspective, device, tools, score, minutes, price, description]
const listings = [
  [0, 'Brake pad replacement, front axle', 'Repair', 'Automotive', 'Egocentric', 'Head-mounted camera', ['Socket wrench', 'Caliper tool', 'Torque wrench'], 5, 840, 2900, 'Full pad and rotor swaps on 12 sedans, chest and head view, torque values called out.'],
  [0, 'Engine oil and filter change', 'Repair', 'Automotive', 'Egocentric', 'Phone', ['Oil filter wrench', 'Drain pan'], 4, 610, 1500, 'Unstaged shop footage, one job per clip, drain to refill.'],
  [0, 'Tyre mounting and balancing', 'Assembly', 'Automotive', 'Exocentric', 'Phone', ['Tyre changer', 'Balancer'], 4, 420, 980, 'Side view of machine operation with hand positions visible.'],
  [0, 'Spark plug diagnosis and swap', 'Repair', 'Automotive', 'Egocentric', 'Smart glasses', ['Spark plug socket', 'Gap gauge'], 5, 300, 1250, 'Close-range work in tight engine bays, gap checks narrated.'],
  [1, 'Consumer unit wiring, residential', 'Wiring', 'Electrical', 'Egocentric', 'Head-mounted camera', ['Wire stripper', 'Insulated screwdriver', 'Multimeter'], 5, 1260, 4800, 'Breaker panel builds from bare enclosure to tested board.'],
  [1, 'Socket and switch installation', 'Wiring', 'Electrical', 'Egocentric', 'Phone', ['Wire stripper', 'Voltage tester'], 4, 760, 1900, 'Strip, terminate and fix 140 outlets across 6 flats.'],
  [1, 'Conduit bending and fitting', 'Assembly', 'Construction', 'Exocentric', 'Phone', ['Conduit bender', 'Hacksaw'], 3, 380, 600, 'EMT bends to measured offsets, tripod view.'],
  [1, 'Split AC unit install', 'Assembly', 'HVAC', 'Egocentric', 'Action camera', ['Flaring tool', 'Vacuum pump', 'Drill'], 4, 540, 1700, 'Indoor and outdoor unit mounting, flare joints, vacuum and leak test.'],
  [2, 'Trouser hemming on industrial machine', 'Sewing', 'Textile', 'Egocentric', 'Phone', ['Sewing machine', 'Fabric scissors'], 5, 920, 2400, 'Measure, cut, press and stitch. Deformable material handling throughout.'],
  [2, 'Hand buttonhole stitching', 'Sewing', 'Textile', 'Egocentric', 'Phone', ['Needle', 'Thimble'], 4, 310, 900, 'Fine two-hand needle work, macro view.'],
  [2, 'Pattern cutting from bolt cloth', 'Folding', 'Textile', 'Exocentric', 'Phone', ['Shears', 'Tailor chalk'], 4, 450, 1100, 'Laying, marking and cutting wool and cotton.'],
  [2, 'Garment pressing and folding', 'Folding', 'Textile', 'Egocentric', 'Head-mounted camera', ['Steam iron'], 3, 520, 700, 'Shirts, trousers and jackets, press then fold for delivery.'],
  [3, 'MIG welding, steel fillet joints', 'Welding', 'Manufacturing', 'Egocentric', 'Action camera', ['MIG welder', 'Angle grinder', 'Clamps'], 5, 700, 3600, 'Through-visor view with auto-darkening filter, tack to finished bead.'],
  [3, 'TIG welding, stainless tube', 'Welding', 'Manufacturing', 'Egocentric', 'Action camera', ['TIG torch', 'Filler rod'], 4, 480, 2600, 'Two-hand torch and filler coordination on 40mm tube.'],
  [3, 'Angle grinder cut and deburr', 'Machining', 'Manufacturing', 'Exocentric', 'Phone', ['Angle grinder', 'File'], 3, 260, 450, 'Stock prep before welding, bench view.'],
  [3, 'Steel gate frame assembly', 'Assembly', 'Construction', 'Exocentric', 'Phone', ['Clamps', 'Square', 'MIG welder'], 4, 890, 2100, 'Measure, clamp, tack and square a full frame.'],
  [0, 'Workshop cleanup and tool return', 'Cleaning', 'Automotive', 'Egocentric', 'Phone', ['Broom', 'Parts washer'], 3, 240, 300, 'End of day routine, tools back to shadow board.'],
  [1, 'Cable pulling through trunking', 'Wiring', 'Construction', 'Egocentric', 'Head-mounted camera', ['Fish tape', 'Cable cutter'], 4, 660, 1600, 'Deformable cable handling over long runs in commercial fit-outs.'],
  [1, 'Kitchen sink trap replacement', 'Plumbing', 'Domestic', 'Egocentric', 'Phone', ['Pipe wrench', 'PTFE tape'], 4, 180, 60, 'Old trap out, new trap in, leak test. Tight under-sink work.'],
  [3, 'Door frame cut and fit', 'Carpentry', 'Construction', 'Exocentric', 'Phone', ['Mitre saw', 'Chisel', 'Level'], 4, 360, 110, 'Measure, cut, chisel hinge recesses and hang.'],
  [6, 'Monthly sales pivot and chart in Excel', 'Spreadsheet', 'Office', 'Screen', 'Computer screen', ['Excel'], 4, 95, 30, 'From a raw export to a pivot table and chart. Every click and formula on screen.'],
]
// One sample listing per task, the best scored, so the marketplace shows breadth rather than five welding clips.
const onePerTask = [...new Map([...listings].sort((a, b) => a[7] - b[7]).map((l) => [l[2], l])).values()]
for (const [s, title, task, industry, perspective, device, tools, score, minutes, price, description] of onePerTask) {
  await sql`insert into uploads (seller_id, title, status, quality_score, labels, description, minutes, price)
    values (${ids[s]}, ${title}, 'scored', ${score}, ${JSON.stringify({ task, industry, perspective, device, tools })}::jsonb, ${description}, ${minutes}, ${price})`
}

// [buyer, title, description, task, industry, hours, rate]
const calls = [
  [4, '500 hours of egocentric panel wiring', 'Residential and light commercial boards. Head or chest mounted, both hands visible, terminations in focus.', 'Wiring', 'Electrical', 500, 15],
  [4, 'Brake and suspension jobs, any make', 'Full jobs start to finish. Torque steps must be visible.', 'Repair', 'Automotive', 300, 13],
  [5, 'Deformable material handling: fabric', 'Cutting, pinning, sewing and folding. Machine and hand work both wanted.', 'Sewing', 'Textile', 400, 10],
  [5, 'Weld bead footage through the visor', 'MIG or TIG. Need torch angle and travel speed visible.', 'Welding', 'Manufacturing', 200, 22],
  [5, 'Split AC installs in high-rise flats', 'Indoor and outdoor units, flare joints, vacuum and leak test.', 'Assembly', 'HVAC', 150, 16],
  [5, 'Excel: build a pivot table from raw sales data', 'Screen recording from a raw export to a finished pivot table and chart.', 'Spreadsheet', 'Office', 100, 12],
]
for (const [b, title, description, task, industry, hours, rate] of calls) {
  await sql`insert into calls (buyer_id, title, description, task, industry, hours, rate) values (${ids[b]}, ${title}, ${description}, ${task}, ${industry}, ${hours}, ${rate})`
}
console.log(`seeded ${listings.length} listings, ${calls.length} calls`)
