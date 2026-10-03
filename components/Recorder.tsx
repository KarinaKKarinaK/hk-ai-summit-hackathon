'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { getHands, getFace, getPose } from '@/lib/quality'
import { countFingers } from '@/lib/score'
import { buildArm, buildMug, buildTable, addLights, GRIP } from '@/lib/arm'
import Dither from './Dither'
import UploadForm from '@/components/UploadForm'

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
// Live warning thresholds. Tune on real phones.
const DARK = 60 // mean luma below this is too dark
const FAST = 0.06 // wrist travel per frame (share of frame width) above this will blur
const CHALLENGE_MS = 10_000 // time allowed to answer the finger challenge

// Hand overlay: bones between the 21 landmarks, a web across neighbouring fingers, and the outline that gets filled.
const GREEN = '57, 255, 20'
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]]
const WEB = [[1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 7], [6, 10], [10, 14], [14, 18], [7, 11], [11, 15], [15, 19], [8, 12], [12, 16], [16, 20], [0, 9], [0, 13], [5, 10], [9, 14], [13, 18], [6, 9], [10, 13], [14, 17]]
const HULL = [0, 1, 2, 3, 4, 8, 12, 16, 20, 19, 18, 17]
const TIPS = [4, 8, 12, 16, 20]
const HAND_JOINTS = Array.from({ length: 21 }, (_, i) => i)
// Body: MediaPipe's 33 pose points. The first 11 sit on the face, which the face mesh covers better.
const BODY = PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]).filter(([a, b]) => a > 10 && b > 10)
const BODY_JOINTS = Array.from({ length: 22 }, (_, i) => i + 11)
const FACE = FaceLandmarker.FACE_LANDMARKS_TESSELATION.map((c) => [c.start, c.end])
const AMBER = '255, 176, 59'
type Pt = { x: number; y: number; z: number; visibility?: number }

type Mode = 'arm' | 'other'
type QuickTask = { id: string; title: string; description: string; rate: number }
type Take = { file: File; episode: object; videoHref: string; episodeHref: string; verified: boolean }
type Challenge = { n: number; at: number; t_ms: number; streak: number; passed: boolean | null }
type Rec = { mr: MediaRecorder; chunks: Blob[]; frames: object[]; accel: number[][]; gyro: number[][]; t0: number; challenge: Challenge }

export default function Recorder({ tasks }: { tasks: QuickTask[] }) {
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const rec = useRef<Rec | null>(null)
  const [mode, setMode] = useState<Mode>('arm')
  const [status, setStatus] = useState('Starting camera')
  const [recording, setRecording] = useState(false)
  const [take, setTake] = useState<Take | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [warn, setWarn] = useState<string[]>([])
  const [live, setLive] = useState<number | null>(null)
  const [prompt, setPrompt] = useState('')
  const [seen, setSeen] = useState<string[]>([]) // what is being tracked right now: hands, face, body
  const [cup, setCup] = useState('reach') // where the cup task is: reach, near, held, lifted
  const [request, setRequest] = useState<{ id: string; title: string } | null>(null)
  const [signedIn, setSignedIn] = useState(true) // assumed until the check below says otherwise
  const [choice, setChoice] = useState('cup') // which task is picked: the cup practice, a quick request, or anything else

  // A seller arrives here from a buyer's request: /record?request=<id>&title=<text>
  useEffect(() => {
    fetch('/api/upload').then((r) => setSignedIn(r.ok)).catch(() => {})
    const q = new URLSearchParams(location.search), id = q.get('request') ?? ''
    if (/^[0-9a-f-]{36}$/.test(id)) (setRequest({ id, title: (q.get('title') ?? 'a buyer request').slice(0, 120) }), setMode('other'), setChoice(id))
  }, [])

  useEffect(() => {
    const v = video.current!, o = overlay.current!
    let raf = 0, stop = false

    // The mirrored arm is one of two modes. "Other task" records the same data without it.
    let renderer: THREE.WebGLRenderer | null = null
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
    const arm = buildArm(), mug = buildMug()
    mug.position.set(0.6, 0, 0.6)
    let held = false, cupState = 'reach'
    if (mode === 'arm' && stage.current) {
      const el = stage.current
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
        renderer.setSize(el.clientWidth, el.clientHeight)
        el.appendChild(renderer.domElement)
        cam.aspect = el.clientWidth / el.clientHeight
        cam.updateProjectionMatrix()
        cam.position.set(0, 1.5, 4.4)
        cam.lookAt(0, 1, 0)
        addLights(scene, renderer)
        const table = buildTable(3.8, 2.8) // the bench the arm is bolted to and the cup stands on
        table.position.x = 0
        scene.add(arm.root, mug, table)
      } catch {
        renderer = null // no WebGL: keep recording, just without the arm
      }
    }
    const target = new THREE.Vector3(0.8, 1.2, 0.6)
    let open = 1
    arm.solve(target.x, target.y, target.z, open)

    // in-app browsers (Instagram, WeChat) often have no mediaDevices at all
    const camera = navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      ?? Promise.reject(new Error('this browser blocks the camera. Open the site in Safari or Chrome'))
    camera
      .then(async (s) => {
        if (stop) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        v.srcObject = s
        await v.play()
        setStatus('Loading hand model')
        const hands = await getHands('VIDEO')
        // face and body are extras: if either model fails to load, recording still works with hands only
        const [face, pose] = await Promise.all([getFace().catch(() => null), getPose().catch(() => null)])
        let faceLm: Pt[] | undefined, poseLm: Pt[] | undefined
        setStatus('Tracking')
        const ctx = o.getContext('2d')!
        const px = Object.assign(document.createElement('canvas'), { width: 32, height: 18 }).getContext('2d', { willReadFrequently: true })!
        let n = 0, hit = 0, move = 0, last: { x: number; y: number } | null = null

        const tick = () => {
          if (stop) return
          raf = requestAnimationFrame(tick)
          if (v.readyState < 2) return renderer?.render(scene, cam)
          if (o.width !== v.videoWidth) (o.width = v.videoWidth), (o.height = v.videoHeight)
          const now = performance.now()
          const all: Pt[][] = hands.detectForVideo(v, now).landmarks // up to two hands
          const lm = all[0]
          // face and body take turns, so three models never all run on the same frame
          if (n % 2 === 0) { if (face) faceLm = face.detectForVideo(v, now).faceLandmarks[0] } else if (pose) poseLm = pose.detectForVideo(v, now).landmarks[0]
          const r = rec.current
          ctx.clearRect(0, 0, o.width, o.height)
          const u = o.width / 640 // stroke sizes follow the video size
          const X = (p: Pt) => p.x * o.width, Y = (p: Pt) => p.y * o.height
          let strict = false // only the body model reports visibility. Hands and face report 0, so they must not be filtered on it.
          const shown = (p?: Pt) => !!p && (!strict || (p.visibility ?? 1) > 0.5)
          const stroke = (pts: Pt[], pairs: number[][], width: number, color: string) => {
            ctx.beginPath()
            for (const [a, b] of pairs) if (shown(pts[a]) && shown(pts[b])) (ctx.moveTo(X(pts[a]), Y(pts[a])), ctx.lineTo(X(pts[b]), Y(pts[b])))
            ctx.lineWidth = width * u
            ctx.strokeStyle = color
            ctx.stroke()
          }
          const skin = (pts: Pt[], ids: number[], color: string) => {
            if (!ids.every((i) => shown(pts[i]))) return
            ctx.beginPath()
            ids.forEach((i, k) => (k ? ctx.lineTo(X(pts[i]), Y(pts[i])) : ctx.moveTo(X(pts[i]), Y(pts[i]))))
            ctx.closePath()
            ctx.fillStyle = color
            ctx.fill()
          }
          const joints = (pts: Pt[], ids: number[], size: (i: number) => number, color: string) => {
            ctx.fillStyle = ctx.shadowColor = color
            ctx.shadowBlur = 12 * u
            for (const i of ids) if (shown(pts[i])) (ctx.beginPath(), ctx.arc(X(pts[i]), Y(pts[i]), size(i) * u, 0, Math.PI * 2), ctx.fill())
            ctx.shadowBlur = 0
          }
          // body: a filled torso, the skeleton, and a joint at each landmark. Shows when a whole person is in view.
          if (poseLm) {
            strict = true
            skin(poseLm, [11, 12, 24, 23], `rgba(${GREEN}, 0.1)`)
            stroke(poseLm, BODY, 3.5, `rgba(${GREEN}, 0.9)`)
            joints(poseLm, BODY_JOINTS, () => 6, `rgb(${GREEN})`)
            strict = false
          }
          // face: the full tessellated mesh, drawn fine. Shown live, never saved to the episode.
          if (faceLm) stroke(faceLm, FACE, 0.8, `rgba(${GREEN}, 0.55)`)
          // each hand: a translucent skin, a fine web across it, then the bones and joints on top
          for (const h of all) {
            skin(h, HULL, `rgba(${GREEN}, 0.1)`)
            stroke(h, WEB, 1, `rgba(${GREEN}, 0.35)`)
            stroke(h, BONES, 3, `rgba(${GREEN}, 0.95)`)
            joints(h, HAND_JOINTS, (i) => (TIPS.includes(i) ? 8 : 5.5), `rgb(${GREEN})`)
          }
          if (lm) {

            const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1 // bigger hand = closer
            const x = facing === 'user' ? 1 - lm[0].x : lm[0].x
            // smoothing: exponential moving average
            target.lerp(new THREE.Vector3((x - 0.5) * 2.6, 0.2 + (1 - lm[0].y) * 1.7, mode === 'arm' ? 0.6 : clamp(1 - size * 2.5, 0.2, 1)), 0.35)
            open += (clamp((Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / size - 0.2) / 0.8, 0, 1) - open) * 0.5
            arm.solve(target.x, target.y, target.z, open)
            // The cup task. In arm mode the claw moves in the cup's plane, so your hand steers left, right, up and down.
            // Bring the claw over the cup and low, pinch to grab, lift. Open your hand to let go and the cup drops back.
            const tipY = target.y - GRIP, near = Math.abs(target.x - mug.position.x) < 0.26
            if (!held && near && tipY < 0.4 && open < 0.45) held = true
            else if (held && open > 0.7) held = false
            if (held) mug.position.set(target.x, Math.max(0, tipY - 0.12), target.z)
            else mug.position.y = Math.max(0, mug.position.y - 0.06)
            const state = held ? (mug.position.y > 0.4 ? 'lifted' : 'held') : near ? 'near' : 'reach'
            if (state !== cupState) setCup((cupState = state))
            r?.frames.push({
              t: Math.round(performance.now() - r.t0),
              landmarks: lm.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]),
              gripper: { x: +target.x.toFixed(3), y: +target.y.toFixed(3), z: +target.z.toFixed(3), open: +open.toFixed(2) },
              second_hand: all[1]?.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]),
              body: poseLm?.slice(11).map((p) => [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]), // 22 points from the shoulders down
            })
          }

          // Challenge-response: a random prompt mid-recording that a pre-made video cannot answer.
          if (r && r.challenge.passed === null) {
            const c = r.challenge, now = performance.now() - r.t0
            if (now >= c.at) {
              if (!c.t_ms) (c.t_ms = Math.round(now)), setPrompt(`Show ${c.n} fingers`)
              c.streak = all.some((h) => countFingers(h) === c.n) ? c.streak + 1 : 0 // either hand can answer
              if (c.streak >= 6) (c.passed = true), setPrompt('Verified. Keep going')
              else if (now > c.at + CHALLENGE_MS) (c.passed = false), setPrompt('Challenge missed. Stop and record again')
            }
          }

          // Live quality: warn while filming, not after upload. Refreshed twice a second.
          n++
          if (lm) {
            hit++
            if (last) move += Math.hypot(lm[0].x - last.x, lm[0].y - last.y)
            last = { x: lm[0].x, y: lm[0].y }
          } else last = null
          if (n % 15 === 0) {
            px.drawImage(v, 0, 0, 32, 18)
            const d = px.getImageData(0, 0, 32, 18).data
            let sum = 0
            for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
            const bright = sum / (d.length / 4), share = hit / 15, speed = move / Math.max(hit, 1)
            const w: string[] = []
            if (share < 0.5) w.push('Hands out of frame')
            if (bright < DARK) w.push('Too dark, add light')
            if (speed > FAST) w.push('Moving too fast, the footage will blur')
            setWarn(w)
            setSeen([all.length === 2 ? 'Both hands' : all.length ? 'One hand' : '', faceLm ? 'Face mesh' : '', poseLm ? 'Body' : ''].filter(Boolean))
            setLive(clamp(Math.round(1 + 4 * (0.5 * share + 0.3 * (bright < DARK ? 0.2 : 1) + 0.2 * (speed > FAST ? 0.2 : 1))), 1, 5))
            hit = 0
            move = 0
          }
          renderer?.render(scene, cam)
        }
        tick()
      })
      .catch((e) => setStatus(`Camera unavailable: ${e.message}`))

    return () => {
      stop = true
      cancelAnimationFrame(raf)
      stream.current?.getTracks().forEach((t) => t.stop())
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [facing, mode])

  function toggle() {
    if (rec.current) return rec.current.mr.stop()
    if (!stream.current) return
    const mimeType = ['video/mp4', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const mr = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
    const r: Rec = (rec.current = {
      mr, chunks: [], frames: [], accel: [], gyro: [], t0: performance.now(),
      challenge: { n: 2 + Math.floor(Math.random() * 3), at: 2000 + Math.random() * 3000, t_ms: 0, streak: 0, passed: null },
    })
    // Phone motion sensors, in sync with the video. A generated or re-filmed clip has no matching motion trace. iOS asks on this tap.
    ;(window as any).DeviceMotionEvent?.requestPermission?.()?.catch(() => {})
    const r3 = (x?: number | null) => +(x ?? 0).toFixed(3)
    const onMotion = (e: DeviceMotionEvent) => {
      const t = Math.round(performance.now() - r.t0), a = e.accelerationIncludingGravity, g = e.rotationRate
      r.accel.push([t, r3(a?.x), r3(a?.y), r3(a?.z)])
      r.gyro.push([t, r3(g?.alpha), r3(g?.beta), r3(g?.gamma)])
    }
    window.addEventListener('devicemotion', onMotion)
    mr.ondataavailable = (e) => r.chunks.push(e.data)
    mr.onstop = () => {
      rec.current = null
      window.removeEventListener('devicemotion', onMotion)
      setRecording(false)
      setPrompt('')
      const type = mr.mimeType.split(';')[0] || 'video/webm'
      const file = new File(r.chunks, `episode-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type })
      // Robot-neutral: each frame is a state (hand landmarks, gripper pose) plus the action that leads to the next frame.
      // No joint angles of any one robot, so any gripper can replay it. before -> action -> after.
      const frames = r.frames.map((f: any, i) => {
        const nx: any = r.frames[i + 1] ?? f
        return { ...f, action: { dx: +(nx.gripper.x - f.gripper.x).toFixed(3), dy: +(nx.gripper.y - f.gripper.y).toFixed(3), dz: +(nx.gripper.z - f.gripper.z).toFixed(3), open: nx.gripper.open } }
      })
      const c = r.challenge
      const episode = {
        format: 'guild-episode-v2', gripper: 'two-finger', units: 'landmarks normalised 0..1, gripper in metres', camera: facing, frames,
        sensors: { accel: r.accel, gyro: r.gyro },
        challenges: [{ t_ms: c.t_ms, prompt: `show ${c.n} fingers`, passed: c.passed === true }],
        request_id: request?.id ?? null,
      }
      setTake({ file, episode, verified: c.passed === true, videoHref: URL.createObjectURL(file), episodeHref: URL.createObjectURL(new Blob([JSON.stringify(episode)], { type: 'application/json' })) })
    }
    mr.start()
    setRecording(true)
    setTake(null)
    setPrompt('')
  }

  // What can be recorded right now: the cup practice with the arm, the quick in-demand requests, or anything else.
  const choices = [
    { key: 'cup', name: 'Pick up the cup', tag: 'Practice with the robot arm', request: null, hint: 'Pick up the cup in the 3D view. Move your hand until the claw is over it, lower it, pinch thumb and finger to grab, then lift. Open your hand to put it down.' },
    ...tasks.map((t) => ({ key: t.id, name: t.title, tag: `In demand, pays $${t.rate}/h`, request: { id: t.id, title: t.title }, hint: t.description })),
    ...(request && !tasks.some((t) => t.id === request.id) ? [{ key: request.id, name: request.title, tag: 'Paid request', request, hint: 'Record this task from start to finish. Keep both hands in frame.' }] : []),
    { key: 'other', name: 'Something else', tag: 'Any hands-on task', request: null, hint: 'Film any hands-on task from start to finish: tighten a bolt, strip a wire, fold a shirt. Keep both hands in frame.' },
  ]
  const current = choices.find((c) => c.key === choice) ?? choices[0]
  const pickTask = (c: (typeof choices)[number]) => (setChoice(c.key), setMode(c.key === 'cup' ? 'arm' : 'other'), setRequest(c.request), setTake(null))
  const mirror = facing === 'user' ? '-scale-x-100' : ''
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-5xl">{request ? 'Record for a request' : mode === 'arm' ? 'Your hand, a robot arm.' : 'Record any task.'}</h1>
          <p className="muted mt-2 text-sm">{request ? <>Filming for: <span className="text-paper">{request.title}</span>. Guaranteed payout when the clip passes the checks.</> : 'Tracks both hands, your face and your body live. Hands and body go into the episode, your face does not.'}</p>
        </div>
        {/* two ways to record: mirrored by the arm, or any other task without it */}
      </div>

      {/* pick what to record */}
      <div role="group" aria-label="What to record" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* the landing page's posters: the picked task is the orange one */}
        {choices.map((c, i) => (
          <button key={c.key} disabled={recording} aria-pressed={choice === c.key} onClick={() => pickTask(c)} className={`tile flex min-h-24 flex-col justify-end p-3 text-left md:min-h-28 md:p-4 ${choice === c.key ? 'tile-flame text-ink' : 'tile-coal'}`}>
            <Dither tone={choice === c.key ? 'flame' : 'coal'} seed={i * 1.7 + 0.8} />
            <span className="block text-sm font-semibold leading-snug md:text-base">{c.name}</span>
            <span className={`mt-0.5 block text-xs ${choice === c.key ? 'opacity-80' : c.request ? 'text-emerald-300' : 'muted'}`}>{c.tag}</span>
          </button>
        ))}
      </div>

      <div className="tile tile-coal flex items-start gap-3 border-l-[3px] border-flame p-4 text-sm">
        <Dither tone="coal" seed={3.1} className="opacity-40" />
        <span className="chip flex-none !bg-ink/70">Try this</span>
        <p>{current.hint}</p>
      </div>

      <div className={`grid gap-3 ${mode === 'arm' ? 'md:grid-cols-2' : ''}`}>
        <div className={`card relative overflow-hidden !bg-coal ${mode === 'arm' ? 'aspect-video' : 'aspect-[3/4] md:aspect-video'}`}>
          <video ref={video} playsInline muted className={`h-full w-full object-cover ${mirror}`} />
          <canvas ref={overlay} className={`absolute inset-0 h-full w-full object-cover ${mirror}`} />
          <p className={`chip absolute left-3 top-3 ${recording ? 'bg-red-700 text-paper' : 'bg-ink/70'}`}>{recording ? 'Recording' : status}</p>
          {live !== null && <p className="chip chip-warm absolute right-3 top-3">Live quality {live}/5</p>}
          <p className="absolute left-3 top-11 flex gap-1.5">{seen.map((s) => <span key={s} className="chip bg-emerald-500/25 text-emerald-200">{s}</span>)}</p>
          {prompt && <p role="status" className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-box bg-ink/80 p-4 text-center text-2xl font-semibold">{prompt}</p>}
          <ul aria-live="polite" className="absolute inset-x-3 bottom-3 space-y-1">
            {warn.map((w) => <li key={w} className="rounded-box bg-ink/80 px-3 py-1.5 text-sm text-amber-200">{w}</li>)}
          </ul>
        </div>
        {mode === 'arm' && (
          <div className="card relative aspect-video overflow-hidden !bg-coal">
            <div ref={stage} className="absolute inset-0" />
            <p role="status" className={`chip absolute left-3 top-3 ${cup === 'lifted' ? 'bg-emerald-500 text-ink' : cup === 'held' ? 'bg-emerald-500/30 text-emerald-200' : 'bg-ink/70'}`}>
              {cup === 'lifted' ? 'Picked up. Open your hand to put it down' : cup === 'held' ? 'Got it. Now lift' : cup === 'near' ? 'Lower the claw and pinch to grab' : 'Move the claw over the cup'}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button className={`btn ${recording ? '!bg-red-700 !text-paper' : ''}`} onClick={toggle}>{recording ? 'Stop' : 'Record'}</button>
        <button className="btn btn-ghost" disabled={recording} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Flip camera</button>
        {take && <a className="btn btn-ghost" download={take.file.name} href={take.videoHref}>Download video</a>}
        {take && <a className="btn btn-ghost" download="episode.json" href={take.episodeHref}>Download episode JSON</a>}
      </div>
      {!signedIn && <p className="card-warm rounded-box p-3 text-sm">You can try the recorder now. To submit a take and get paid, <a className="underline" href="/login?mode=register">create an account</a> or <a className="underline" href="/login">sign in</a> first.</p>}
      {!take && <p className="muted text-xs">A few seconds in, you will be asked to hold up some fingers. It proves the clip is being filmed live. Keep recording until it says verified. When you stop, the take is processed and submitted automatically. By recording you confirm that you filmed it yourself, anyone identifiable agreed, you had permission to film there, and you grant a non-exclusive training licence. You keep ownership and can withdraw it later.</p>}
      {take && !take.verified && (
        <section className="card p-5">
          <h2 className="text-xl">This take cannot be submitted</h2>
          <p className="muted mt-1 text-sm">The finger challenge was not completed, so we cannot show it was filmed live. Record again and hold up the fingers when asked.</p>
        </section>
      )}
      {take?.verified && (
        <section className="space-y-3 pt-4">
          <h2 className="text-2xl">Submit this take</h2>
          <UploadForm key={take.file.name} initialFile={take.file} episode={take.episode} requestId={request?.id} />
        </section>
      )}
    </main>
  )
}
