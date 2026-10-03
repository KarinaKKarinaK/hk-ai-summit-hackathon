# Implementation Plan: 4 people in parallel

Goal: live demo (wave hand, robot mirrors, export episode) plus a working marketplace with upload, auto-labels, quality score, and buyer view.

## Stack (keep it boring)

- Capture + 3D: web app (works on phone browser, no app store needed). MediaPipe Hands (21 landmarks, 3D, runs in browser for free) + three.js for the robot arm.
- Marketplace: Next.js + Supabase (auth, Postgres, file storage). One repo, two routes: `/record` and `/market`.
- Auto-labeling + quality score: Claude API with vision over sampled frames.

Why browser, not native app: MediaPipe runs in-browser at real-time speed, one codebase serves phone and desktop, and judges can open it on their own phones.

## Roles

| Person | Owns | Deliverable |
|--------|------|-------------|
| A: Tracking | Hand + object tracking, gripper retargeting | Live 3D hand pose stream + gripper open/close signal |
| B: Robot + export | three.js arm that mirrors the hand, episode recorder/export | The wow demo view + episode JSON/video export |
| C: Marketplace | Next.js app, auth, upload, seller/buyer UIs, open calls | Working two-sided marketplace |
| D: Quality + pitch | Frame sampling, VLM label suggestion, quality score 1-5, pitch deck and demo script | Upload-to-score pipeline + the pitch |

## The contract (agree in hour 1, then nobody blocks anybody)

Everything integrates through two artifacts. Define them first, commit them to the repo, mock them immediately.

### Episode format (A produces, B consumes live, C/D consume as file)

```json
{
  "episode_id": "uuid",
  "fps": 30,
  "device": "iPhone 15",
  "frames": [
    {
      "t_ms": 0,
      "hand": { "landmarks": [[x, y, z], "... 21 total"] },
      "gripper": { "x": 0, "y": 0, "z": 0, "roll": 0, "pitch": 0, "yaw": 0, "open": 0.8 },
      "objects": [{ "label": "cup", "bbox": [x, y, w, h] }]
    }
  ],
  "video_ref": "storage path"
}
```

### Upload record (C's DB schema, D writes score/labels into it)

```
uploads: id, seller_id, video_url, episode_url, status(pending|scored|rejected),
         quality_score(1-5), labels(jsonb), description, created_at
```

B mocks A with a replayed landmark recording. C mocks D with hardcoded scores. Integrate real pieces as they land.

## Workstreams

### Person A: Tracking

1. MediaPipe Hands in the browser, camera feed, 21 landmarks rendered as dots. Get this working first, it de-risks the whole project.
2. Retarget: wrist position -> gripper position, thumb-index pinch distance -> gripper open/close (0 to 1). Simple and robust beats clever.
3. Smooth the signal (moving average over a few frames) so the arm does not jitter.
4. Record a few clean landmark sequences to file so B can develop against replays.
5. Stretch: object tracking. MediaPipe Objectron or a plain color/bbox tracker on one known object (a cup). Skip if time is short, hand tracking alone carries the demo.

### Person B: Robot arm + export

1. three.js scene with a simple articulated arm: base, two links, two-finger gripper. Build it from primitives (cylinders, boxes), do not fight URDF loaders.
2. Drive the arm from the gripper pose stream: inverse kinematics for a 2-link arm is a closed-form formula, or just place the gripper directly at the target and fake the links pointing at it. Nobody checks joint accuracy, they check that it mirrors instantly.
3. Side-by-side layout: camera feed left, robot view right, mirroring live.
4. Record button: capture episode JSON + video (MediaRecorder API), export as download and POST to C's upload endpoint.
5. Stretch: ghost trail of the gripper path, replay mode for a finished episode.

### Person C: Marketplace

1. Next.js + Supabase: auth (email magic link), roles seller/buyer picked at signup, org = just a field on the profile for the demo.
2. Seller side: upload page (file from gallery, works on phone), description, label picker for the categories in DETAILED_BREAKDOWN, "suggested labels" section that reads D's output with confirm/reject buttons, "my uploads" list showing status, score, and payout estimate.
3. Buyer side: browse listings with filters on labels and score, three-package picker (raw / processed / both) with prices, "post an open call" form and a browseable open-calls page for sellers.
4. Seed realistic demo data: 15 to 20 fake listings across trades, 5 open calls. The marketplace must look alive on stage.
5. Payout estimate = base rate x quality score x label completeness. Display only, no real money.

### Person D: Quality pipeline + pitch

1. On upload: pull N frames spread across the video (ffmpeg or server-side), send to Claude vision with one prompt that returns JSON: suggested labels per category, quality score 1-5 with one-line reasons (lighting, stability, hands visible, task clarity), accept/reject.
2. Write results into C's uploads table, status pending -> scored. This is the whole "initial quality pass" for the demo; describe the teacher-student loop in the pitch as the production version.
3. Blur or flag faces if time allows, otherwise just avoid faces in demo footage.
4. Pitch deck and 3-minute demo script: open with the live mirror demo, then upload the just-recorded episode on stage, show it getting scored and listed, show a buyer filtering to it. One continuous story.
5. Record a backup video of the full flow in case the live demo breaks.

## Timeline (adjust to the real hackathon clock)

| Checkpoint | A | B | C | D |
|------------|---|---|---|---|
| Hour 1 | All four: agree on episode format + DB schema, repo setup | | | |
| +25% | Landmarks live in browser | Arm renders, moves on mock data | Auth + upload working | VLM prompt returns labels + score on a test video |
| +50% | Retargeted gripper stream, smoothed | Arm mirrors A's live stream | Seller flow complete | Pipeline wired to uploads table |
| Integration 1 | Live mirror demo works end to end (A + B) | | Upload -> score -> listing works (C + D) | |
| +75% | Object tracking or polish | Export + POST to marketplace | Buyer side + open calls + seed data | Deck drafted, backup video recorded |
| Final | Full rehearsal twice: record live, upload, score, list, buy. Fix only what breaks. | | | |

## Risks and pre-decided answers

- Hand tracking flaky on stage lighting: test in the actual room early, bring a desk lamp, plain background cloth.
- Retargeting looks wrong: reduce claims, say "approximate retargeting, the pipeline is the product."
- Live demo dies: D's backup video, presenter narrates over it.
- Scope creep: no payments, no real org management, no native app, no real robot. Say "production roadmap" and move on.
