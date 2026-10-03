# Implementation Plan: MVP, 4 people, full parallel

Priority order: 1) marketplace, 2) live capture demo, 3) simple labeling pass. The labeling pipeline only needs to work on stage, not be advanced.

## Stack

- One Next.js repo on Vercel. Routes: `/record`, `/sell`, `/buy`, `/calls`, `/login`.
- As built: Neon Postgres + Vercel Blob instead of Supabase (both provision from the Vercel CLI, no extra account). Auth is email + password with a session cookie, not magic link (no email provider needed on stage).
- Installable on a phone: web manifest + standalone display, bottom tab bar. Share menu, Add to Home Screen.
- Capture demo: MediaPipe Hands + three.js, runs in the browser (works on phone, no app store).
- Labeling MVP: one serverless function, one Kimi vision call (Moonshot API, OpenAI format) on a few sampled frames. That is the whole pipeline. Needs `KIMI_API_KEY` in Vercel env; optional `KIMI_MODEL` (default `kimi-k2.5`) and `KIMI_BASE_URL`.
- Market pricing: `/market` price board, dynamic rate per task from bids (open calls), listed supply and last sale. Sellers can set an ask or fill a bid. Details in `DETAILED_BREAKDOWN.md` section 8.
- Evidence trail: append-only `events` table, shown first on every listing. Observed, proposed, changed, priced, accepted. Buyers must give a reason to accept. Details in section 9.
- Mission line for the pitch: data democratization. Sellers own the data, every lab can buy it. Section 7.
- Live quality layer: before upload, the browser samples 6 frames and scores resolution, length, lighting, sharpness, steadiness and hands-in-frame, each with a fix tip. Final score = technical checks + label completeness + vision review. Logic in `lib/score.ts`, test with `node --test lib/score.test.mjs`.
- Upload contract as built: video goes browser to Blob via `/api/blob` (Vercel bodies cap at 4.5MB), then `POST /api/upload` takes the blob URL + labels + metrics + frames as JSON and inserts the `pending` row.
- Setup: `vercel env pull .env.local`, then `node --env-file=.env.local scripts/init-db.mjs` (schema + seed).

## Skilled labour focus (how we beat Figure Index)

Full research in `DETAILED_BREAKDOWN.md` section 6. In the build:

- Sellers register with trade, years and licence. Buyers see it on every listing.
- Payout multiplier by experience: under 3 years 1x, 3+ years 1.25x, 10+ years 1.5x.
- Vision review returns task steps and a skill read (novice / competent / expert), plus face and screen flags.
- Label set, seed listings and open calls are all trades (wiring, welding, repair, tailoring, HVAC), not chores.
- Seller keeps ownership, sells a non-exclusive licence to many buyers. Figure pays once and keeps the data.

## Roles (no dependencies between people until integration)

| Person | Owns | Done when |
|--------|------|-----------|
| A: Capture demo | `/record`: hand tracking, three.js arm mirroring live, record + export | You wave, arm copies, episode downloads and POSTs to upload endpoint |
| B: Seller side | `/sell`: auth, upload from phone gallery, labels, my-uploads list with score + payout estimate | Video uploaded on a phone shows up scored and listed |
| C: Buyer side | `/buy`: browse listings, filters, 3 packages, open calls, seed data | Marketplace looks alive and filterable on stage |
| D: Labeling MVP + pitch | Upload trigger -> sample frames -> Kimi vision -> labels + score 1-5 into DB. Pitch deck, demo script, backup video | Any upload gets labels and a score within ~30s |

## Hour 1: the contract, then split

All four agree on these two things, commit them, and nobody talks again until integration:

1. `uploads` table:
```
id, seller_id, video_url, episode_url, status(pending|scored),
quality_score int, labels jsonb, description text, created_at
```
2. Upload endpoint: `POST /api/upload` (video file + optional episode JSON) -> inserts row with status `pending`.

Mocks so everyone starts immediately: B and C seed the table with fake scored rows by hand. D tests the labeling function on a local video file. A posts to a dummy endpoint until B's is up.

## Workstreams

### A: Capture demo
1. MediaPipe Hands in browser, landmarks rendered. Do this first, it is the only technical risk in the project.
2. three.js arm from primitives (base, two links, two-finger gripper). No URDF, no real IK: place the gripper at the wrist position, point the links at it, map thumb-index pinch to open/close. Smooth with a moving average.
3. Side-by-side: camera left, arm right. Record button -> video (MediaRecorder) + episode JSON (per-frame landmarks and gripper pose) -> POST to upload endpoint.
4. Cut object tracking entirely. Hand mirror alone is the wow.

### B: Seller side
1. Supabase auth (magic link), role picked at signup. Org = a text field, nothing more.
2. Upload page that works from a phone gallery, plus description and a label picker (perspective, task type, industry, tools, device).
3. My-uploads list: status, score, suggested labels from D with confirm buttons, payout estimate = base rate x score x label count. Display only.

### C: Buyer side
1. Listings grid with filters on labels and score.
2. Listing detail: 3 package options (raw / processed / both) with prices, fake buy button.
3. Open calls: post form + browse page.
4. Seed 15-20 realistic listings across trades and 5 open calls. This is what makes the demo look like a real marketplace, do not skip it.

### D: Labeling MVP + pitch
1. One function: on new upload, grab 4-6 frames (canvas capture client-side on upload is fine, skip server ffmpeg), one Kimi vision call returning JSON: `{labels per category, quality_score, reasons}`. Write to the row, status -> scored.
2. That is the entire pipeline. The teacher-student loop and quality indicators are pitch slides, not code.
3. Deck + 3-minute script: live mirror demo -> upload it on stage -> it gets scored and listed -> buyer filters to it and buys. One continuous story.
4. Backup video of the full flow, recorded before final rehearsal.

## Checkpoints

| When | Must be true |
|------|--------------|
| +25% | A: landmarks live. B: upload inserts a row. C: listings render seed data. D: Kimi call returns labels on a test frame |
| +50% | A: arm mirrors live. B+D integrated: real upload gets real score. C: filters + packages work |
| +75% | A: record/export posts into the marketplace. Full flow works once end to end. D: deck + backup video done |
| Final | Rehearse the full flow twice. Fix only what breaks. Freeze. |

## Cut list (already decided, do not reopen)

No payments, no real orgs, no native app, no object tracking, no server-side video processing, no teacher-student loop, no real robot. All of it is "production roadmap" in the pitch.
