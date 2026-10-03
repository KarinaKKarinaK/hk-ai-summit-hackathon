'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { getHands } from '@/lib/quality'
import UploadForm from '@/components/UploadForm'

const L = 1 // length of each arm link
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
type Take = { file: File; episode: object; videoHref: string; episodeHref: string }

export default function Record() {
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; frames: object[]; t0: number } | null>(null)
  const [status, setStatus] = useState('Starting camera')
  const [recording, setRecording] = useState(false)
  const [take, setTake] = useState<Take | null>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')

  useEffect(() => {
    const v = video.current!, el = stage.current!, o = overlay.current!
    let raf = 0, stop = false

    // Arm from primitives: base, two links, two-finger gripper.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // no WebGL (old phone, locked-down browser): say so instead of crashing the page
      setStatus('3D view is not supported in this browser. Try Safari or Chrome.')
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 50)
    cam.position.set(0, 1.5, 4.4)
    cam.lookAt(0, 1, 0)
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x080403, 1.4))
    const sun = new THREE.DirectionalLight(0xffd9b0, 2.2)
    sun.position.set(2, 4, 3)
    scene.add(sun, new THREE.GridHelper(6, 12, 0x482912, 0x2a180a))
    const brown = new THREE.MeshStandardMaterial({ color: 0x6b492e, roughness: 0.55, metalness: 0.35 })
    const slate = new THREE.MeshStandardMaterial({ color: 0x8e9a9b, roughness: 0.4, metalness: 0.6 })
    const box = (w: number, h: number, d: number, m = brown) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    const base = new THREE.Group()
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.2, 32), slate)
    foot.position.y = 0.1
    const shoulder = new THREE.Group()
    shoulder.position.y = 0.2
    const l1 = box(0.16, L, 0.16)
    l1.position.y = L / 2
    const elbow = new THREE.Group()
    elbow.position.y = L
    const l2 = box(0.13, L, 0.13)
    l2.position.y = L / 2
    const fingers = [-1, 1].map(() => box(0.04, 0.24, 0.1, slate))
    fingers.forEach((f) => (f.position.y = L + 0.12))
    elbow.add(l2, ...fingers)
    shoulder.add(l1, elbow)
    base.add(foot, shoulder)
    scene.add(base)

    const target = new THREE.Vector3(0.8, 1.2, 0.6)
    let open = 1
    // Two-link analytic IK: yaw the base at the target, then law of cosines in the arm's plane.
    const solve = () => {
      const r = Math.hypot(target.x, target.z), y = target.y - 0.2
      const d = clamp(Math.hypot(r, y), 0.3, 2 * L - 0.01)
      base.rotation.y = Math.atan2(-target.z, target.x)
      shoulder.rotation.z = Math.atan2(y, r) + Math.acos(d / (2 * L)) - Math.PI / 2
      elbow.rotation.z = Math.acos(1 - (d * d) / (2 * L * L)) - Math.PI
      fingers.forEach((f, i) => (f.position.z = (i ? 1 : -1) * (0.03 + open * 0.09)))
    }
    solve()

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
        const tick = () => {
          if (stop) return
          raf = requestAnimationFrame(tick)
          if (v.readyState >= 2) {
            if (o.width !== v.videoWidth) (o.width = v.videoWidth), (o.height = v.videoHeight)
            const lm = hands.detectForVideo(v, performance.now()).landmarks[0]
            ctx.clearRect(0, 0, o.width, o.height)
            if (lm) {
              ctx.fillStyle = '#8e9a9b'
              for (const p of lm) ctx.fillRect(p.x * o.width - 4, p.y * o.height - 4, 8, 8)
              const size = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 0.1 // bigger hand = closer
              const x = facing === 'user' ? 1 - lm[0].x : lm[0].x
              // smoothing: exponential moving average
              target.lerp(new THREE.Vector3((x - 0.5) * 2.6, 0.3 + (1 - lm[0].y) * 1.6, clamp(1 - size * 2.5, 0.2, 1)), 0.35)
              open += (clamp((Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / size - 0.2) / 0.8, 0, 1) - open) * 0.5
              solve()
              rec.current?.frames.push({
                t: Math.round(performance.now() - rec.current.t0),
                landmarks: lm.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]),
                gripper: { x: +target.x.toFixed(3), y: +target.y.toFixed(3), z: +target.z.toFixed(3), open: +open.toFixed(2) },
              })
            }
          }
          renderer.render(scene, cam)
        }
        tick()
      })
      .catch((e) => setStatus(`Camera unavailable: ${e.message}`))

    return () => {
      stop = true
      cancelAnimationFrame(raf)
      stream.current?.getTracks().forEach((t) => t.stop())
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [facing])

  function toggle() {
    if (rec.current) return rec.current.mr.stop()
    if (!stream.current) return
    const mimeType = ['video/mp4', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const mr = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
    const r = (rec.current = { mr, chunks: [] as Blob[], frames: [] as object[], t0: performance.now() })
    mr.ondataavailable = (e) => r.chunks.push(e.data)
    mr.onstop = () => {
      rec.current = null
      setRecording(false)
      const type = mr.mimeType.split(';')[0] || 'video/webm'
      const file = new File(r.chunks, `episode-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type })
      const episode = { format: 'guild-episode-v1', gripper: 'two-finger', units: 'landmarks normalised 0..1, gripper in metres', camera: facing, frames: r.frames }
      setTake({ file, episode, videoHref: URL.createObjectURL(file), episodeHref: URL.createObjectURL(new Blob([JSON.stringify(episode)], { type: 'application/json' })) })
    }
    mr.start()
    setRecording(true)
    setTake(null)
  }

  const mirror = facing === 'user' ? '-scale-x-100' : ''
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-3xl md:text-5xl">Your hand, a robot arm.</h1>
        <p className="muted mt-2 text-sm">Move your hand and pinch. The arm copies you, and the recording exports as a training episode.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card relative aspect-video overflow-hidden">
          <video ref={video} playsInline muted className={`h-full w-full object-cover ${mirror}`} />
          <canvas ref={overlay} className={`absolute inset-0 h-full w-full object-cover ${mirror}`} />
          <p className="absolute left-3 top-3 chip chip-slate">{recording ? 'Recording' : status}</p>
        </div>
        <div ref={stage} className="card streaks aspect-video overflow-hidden" />
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="btn" onClick={toggle}>{recording ? 'Stop' : 'Record episode'}</button>
        <button className="btn btn-ghost" disabled={recording} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Flip camera</button>
        {take && <a className="btn btn-ghost" download={take.file.name} href={take.videoHref}>Download video</a>}
        {take && <a className="btn btn-ghost" download="episode.json" href={take.episodeHref}>Download episode JSON</a>}
      </div>
      {take && (
        <section className="space-y-3 pt-4">
          <h2 className="text-2xl">Sell this take</h2>
          <UploadForm key={take.file.name} initialFile={take.file} episode={take.episode} />
        </section>
      )}
    </main>
  )
}
