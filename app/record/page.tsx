'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getHands } from '@/lib/quality'
import { countFingers } from '@/lib/score'
import { buildArm, addLights } from '@/lib/arm'
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

type Mode = 'arm' | 'other'
type Take = { file: File; episode: object; videoHref: string; episodeHref: string; verified: boolean }
type Challenge = { n: number; at: number; t_ms: number; streak: number; passed: boolean | null }
type Rec = { mr: MediaRecorder; chunks: Blob[]; frames: object[]; accel: number[][]; gyro: number[][]; t0: number; challenge: Challenge }

export default function Record() {
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
  const [request, setRequest] = useState<{ id: string; title: string } | null>(null)

  // A seller arrives here from a buyer's request: /record?request=<id>&title=<text>
  useEffect(() => {
    const q = new URLSearchParams(location.search), id = q.get('request') ?? ''
    if (/^[0-9a-f-]{36}$/.test(id)) (setRequest({ id, title: (q.get('title') ?? 'a buyer request').slice(0, 120) }), setMode('other'))
  }, [])

  useEffect(() => {
    const v = video.current!, o = overlay.current!
    let raf = 0, stop = false

    // The mirrored arm is one of two modes. "Other task" records the same data without it.
    let renderer: THREE.WebGLRenderer | null = null
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
    const arm = buildArm()
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
        addLights(scene)
        scene.add(arm.root, new THREE.GridHelper(6, 12, 0x6b492e, 0x412c1a))
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
        setStatus('Show a hand to the camera')
        const ctx = o.getContext('2d')!
        const px = Object.assign(document.createElement('canvas'), { width: 32, height: 18 }).getContext('2d', { willReadFrequently: true })!
        let n = 0, hit = 0, move = 0, last: { x: number; y: number } | null = null

        const tick = () => {
          if (stop) return
          raf = requestAnimationFrame(tick)
          if (v.readyState < 2) return renderer?.render(scene, cam)
          if (o.width !== v.videoWidth) (o.width = v.videoWidth), (o.height = v.videoHeight)
          const lm = hands.detectForVideo(v, performance.now()).landmarks[0]
          const r = rec.current
          ctx.clearRect(0, 0, o.width, o.height)
          if (lm) {
            const u = o.width / 640 // stroke sizes follow the video size
            const P = (i: number) => [lm[i].x * o.width, lm[i].y * o.height] as const
            const lines = (pairs: number[][], width: number, alpha: number) => {
              ctx.beginPath()
              for (const [a, b] of pairs) (ctx.moveTo(...P(a)), ctx.lineTo(...P(b)))
              ctx.lineWidth = width * u
              ctx.strokeStyle = `rgba(${GREEN}, ${alpha})`
              ctx.stroke()
            }
            // a translucent skin over the whole hand, a fine web across it, then the bones and joints on top
            ctx.beginPath()
            HULL.forEach((i, k) => (k ? ctx.lineTo(...P(i)) : ctx.moveTo(...P(i))))
            ctx.closePath()
            ctx.fillStyle = `rgba(${GREEN}, 0.1)`
            ctx.fill()
            lines(WEB, 1, 0.35)
            lines(BONES, 3, 0.95)
            ctx.fillStyle = `rgb(${GREEN})`
            ctx.shadowColor = `rgb(${GREEN})`
            ctx.shadowBlur = 12 * u
            for (let i = 0; i < 21; i++) {
              ctx.beginPath()
              ctx.arc(...P(i), (TIPS.includes(i) ? 8 : 5.5) * u, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.shadowBlur = 0

            const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1 // bigger hand = closer
            const x = facing === 'user' ? 1 - lm[0].x : lm[0].x
            // smoothing: exponential moving average
            target.lerp(new THREE.Vector3((x - 0.5) * 2.6, 0.3 + (1 - lm[0].y) * 1.6, clamp(1 - size * 2.5, 0.2, 1)), 0.35)
            open += (clamp((Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / size - 0.2) / 0.8, 0, 1) - open) * 0.5
            arm.solve(target.x, target.y, target.z, open)
            r?.frames.push({
              t: Math.round(performance.now() - r.t0),
              landmarks: lm.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]),
              gripper: { x: +target.x.toFixed(3), y: +target.y.toFixed(3), z: +target.z.toFixed(3), open: +open.toFixed(2) },
            })
          }

          // Challenge-response: a random prompt mid-recording that a pre-made video cannot answer.
          if (r && r.challenge.passed === null) {
            const c = r.challenge, now = performance.now() - r.t0
            if (now >= c.at) {
              if (!c.t_ms) (c.t_ms = Math.round(now)), setPrompt(`Show ${c.n} fingers`)
              c.streak = lm && countFingers(lm) === c.n ? c.streak + 1 : 0
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

  const mirror = facing === 'user' ? '-scale-x-100' : ''
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-5xl">{request ? 'Record for a request' : mode === 'arm' ? 'Your hand, a robot arm.' : 'Record any task.'}</h1>
          <p className="muted mt-2 text-sm">{request ? <>Filming for: <span className="text-paper">{request.title}</span>. Guaranteed payout when the clip passes the checks.</> : 'Every recording captures your hand in 3D and exports as a training episode.'}</p>
        </div>
        {/* two ways to record: mirrored by the arm, or any other task without it */}
        <div role="group" aria-label="Recording mode" className="grid grid-cols-2 rounded-full bg-white/[.07] p-1 text-sm">
          {([['arm', 'Robot arm'], ['other', 'Record other']] as const).map(([m, name]) => (
            <button key={m} disabled={recording} aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-full px-4 py-2 transition-colors ${mode === m ? 'bg-tan font-semibold text-paper' : 'muted'}`}>{name}</button>
          ))}
        </div>
      </div>

      <div className="card card-warm flex items-start gap-3 p-4 text-sm">
        <span className="chip bg-ink/40 flex-none">Try this</span>
        <p>{mode === 'arm' ? 'Pick up a cup. Reach for it, pinch to grip, lift it, and put it back down. Watch the arm copy each move.' : 'Film any hands-on task from start to finish: tighten a bolt, strip a wire, fold a shirt. Keep both hands in frame.'}</p>
      </div>

      <div className={`grid gap-3 ${mode === 'arm' ? 'md:grid-cols-2' : ''}`}>
        <div className={`card relative overflow-hidden ${mode === 'arm' ? 'aspect-video' : 'aspect-[3/4] md:aspect-video'}`}>
          <video ref={video} playsInline muted className={`h-full w-full object-cover ${mirror}`} />
          <canvas ref={overlay} className={`absolute inset-0 h-full w-full object-cover ${mirror}`} />
          <p className={`chip absolute left-3 top-3 ${recording ? 'bg-red-700 text-paper' : 'bg-ink/70'}`}>{recording ? 'Recording' : status}</p>
          {live !== null && <p className="chip chip-warm absolute right-3 top-3">Live quality {live}/5</p>}
          {prompt && <p role="status" className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-2xl bg-ink/80 p-4 text-center text-2xl font-semibold">{prompt}</p>}
          <ul aria-live="polite" className="absolute inset-x-3 bottom-3 space-y-1">
            {warn.map((w) => <li key={w} className="rounded-lg bg-ink/80 px-3 py-1.5 text-sm text-amber-200">{w}</li>)}
          </ul>
        </div>
        {mode === 'arm' && <div ref={stage} className="card streaks aspect-video overflow-hidden" />}
      </div>

      <div className="flex flex-wrap gap-3">
        <button className={`btn ${recording ? '!bg-red-700 !text-paper' : ''}`} onClick={toggle}>{recording ? 'Stop' : 'Record'}</button>
        <button className="btn btn-ghost" disabled={recording} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Flip camera</button>
        {take && <a className="btn btn-ghost" download={take.file.name} href={take.videoHref}>Download video</a>}
        {take && <a className="btn btn-ghost" download="episode.json" href={take.episodeHref}>Download episode JSON</a>}
      </div>
      {!take && <p className="muted text-xs">A few seconds in, you will be asked to hold up some fingers. It proves the clip is being filmed live. Keep recording until it says verified.</p>}
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
