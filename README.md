# Guild

The open market for robot training data. Skilled tradespeople film real work on their phone, get a quality score before they upload, and license the footage to any robotics lab. Prices move with demand, and the worker earns a royalty on every sale.

Live: https://guild-data.vercel.app (installable on a phone: share menu, Add to Home Screen)

Built for the HK AI Summit hackathon. Demo only: no money moves, and listings marked Sample are seeded.

## Why

- Robots learn from human demonstration video, and there is not enough of it.
- The largest collectors pay a flat fee for household chores and keep the data for one robot.
- We do the opposite: skilled trade work, owned by the worker, sold on an open market to every buyer.

More in [DETAILED_BREAKDOWN.md](DETAILED_BREAKDOWN.md): Figure comparison (6), mission (7), market design (8), evidence trail (9), worker concerns (10), business framing (11).

## What is in the app

| Page | What it does |
|------|--------------|
| `/` | Pitch: the business, unit economics calculator, mission, worker benefits |
| `/record` | Camera hand tracking with a 3D robot arm that mirrors you. Records video plus a hand-pose episode file |
| `/sell` | Upload from the phone gallery. Live quality and originality checks, labels, market price, set an ask, sell into a bid, withdraw |
| `/buy` | Marketplace with filters. Each buyer gets a private acceptance profile |
| `/buy/[id]` | Listing: evidence trail, price breakdown, three packages, accept or pass with a reason |
| `/market` | Price board per trade: rate, top bid, last sale, hours wanted, hours listed |
| `/calls` | Buyers post bids: hours wanted at a rate per hour |
| `/login` | Email and password, seller or buyer |

## How an upload is checked

1. In the browser, before upload: six frames are sampled and scored for resolution, length, lighting, sharpness, steadiness and hands in frame. Each failing check says how to fix it.
2. Originality: a file fingerprint and a perceptual hash per frame are compared with every clip already uploaded. A copy is saved but never listed.
3. On the server: a Kimi vision call proposes labels, steps, a skill read and privacy flags.
4. Final score 1 to 5 from technical checks, label completeness and the model's content score. Below 2 is not listed.
5. Every step is written to an append-only evidence trail that buyers can read.

## Pricing

Each task is its own market, in USD per hour of footage.

- Rate = average bid ($20/h if none) x 0.6 to 1.4 by hours wanted against hours listed, pulled 30% toward the last sale.
- Clip price = rate x length x score / 4 x experience tier (1x, 1.25x at 3 years, 1.5x at 10).
- The seller keeps 80%.

All of it is in `lib/score.ts`.

## Stack

- Next.js 16 (App Router), Tailwind 4, deployed on Vercel
- Neon Postgres, Vercel Blob for video
- MediaPipe Hands and three.js in the browser
- Kimi (Moonshot) vision API for labelling

## Run it

```sh
pnpm install
vercel link
vercel env pull .env.local        # DATABASE_URL, BLOB_READ_WRITE_TOKEN
node --env-file=.env.local scripts/init-db.mjs   # tables + demo data, safe to rerun
pnpm dev
```

Environment variables:

| Name | Needed | Notes |
|------|--------|-------|
| `DATABASE_URL` | yes | Set by the Neon integration |
| `BLOB_READ_WRITE_TOKEN` | yes | Set by the Blob store |
| `KIMI_API_KEY` | for labelling | Without it uploads are scored on technical checks and labels only |
| `KIMI_MODEL`, `KIMI_BASE_URL` | no | Default `kimi-k2.5` on `https://api.moonshot.ai/v1` |

Keep secrets in Vercel (`vercel env add`), not only in `.env.local`. `vercel env pull` overwrites that file.

Tests: `pnpm test` covers scoring, pricing and the duplicate check.

Deploy: `vercel --prod`

## Layout

```
app/            pages, server actions (actions.ts), API routes (api/)
components/     UploadForm, Calculator, Tabs
lib/score.ts    scoring, pricing, duplicate hashing. Pure, shared by browser and server
lib/quality.ts  in-browser frame analysis and hand detection
lib/server.ts   database, sessions, market query, evidence log
scripts/        init-db.mjs
```

## Known limits

- Quality metrics and duplicate hashes are computed in the seller's browser and can be spoofed.
- The duplicate check misses trimmed or mirrored copies.
- Trade, years and licence are self-declared.
- Video files sit on unguessable but public URLs.
- No payments, no password reset, no login rate limit.
