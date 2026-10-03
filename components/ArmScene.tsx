'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { buildArm, buildMug, buildFloor, addLights } from '@/lib/arm'
import Dither from './Dither'

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const MISSION = [
  ['Open to every lab', 'Any robotics company, startup or university can license the same data, on the same terms.'],
  ['Owned by the people who do the work', 'Sellers keep their footage and earn every time it is licensed.'],
  ['Priced in the open', 'Rates follow real demand on a public index. Nobody sets them behind closed doors.'],
  ['Proof, not trust', 'Every clip carries the record of how it was filmed, labelled and checked.'],
]

/**
 * Landing page 3D: one arm and one glass mug, driven by scroll. Reach, grip, lift, then swing left and set it down.
 * The scene arrives as coarse pixels and sharpens, the camera closes in on the claw for the grip, and the frame is
 * marked up the way a labelling tool would: joint angles, the action, a box round the mug.
 * Also runs the page's smooth scroll and the light that follows the pointer.
 */
export default function ArmScene() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const marks = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const el = stage.current!, sec = section.current!
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.registerPlugin(ScrollTrigger)

    // smooth scroll, kept in step with ScrollTrigger
    const lenis = calm ? null : new Lenis({ lerp: 0.075, wheelMultiplier: 0.9 })
    const raf = (t: number) => lenis?.raf(t * 1000)
    if (lenis) {
      lenis.on('scroll', ScrollTrigger.update)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)
    }

    // pointer: a soft light follows it down the page, and the camera leans a little toward it
    const mouse = { x: 0, y: 0 }
    let redraw = () => {}
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      mouse.x = e.clientX / innerWidth - 0.5
      mouse.y = e.clientY / innerHeight - 0.5
      if (glow.current) {
        glow.current.style.opacity = '0.16'
        glow.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      }
      redraw()
    }
    if (!calm) addEventListener('pointermove', onMove)
    const stop = () => { removeEventListener('pointermove', onMove); gsap.ticker.remove(raf); lenis?.destroy() }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return stop // no WebGL: the text still tells the story
    }
    const sharp = Math.min(devicePixelRatio, 1.5)
    renderer.domElement.style.imageRendering = 'pixelated'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50)
    addLights(scene, renderer)
    // coloured light from the sides so the metal picks up the page's orange and pink
    const warm = new THREE.PointLight(0xee7340, 14, 7), rose = new THREE.PointLight(0xff5fa8, 12, 7)
    warm.position.set(2.2, 0.9, -1.6)
    rose.position.set(-2.2, 1.3, 1.6)
    const arm = buildArm('graphite'), mug = buildMug()
    scene.add(arm.root, buildFloor(), mug, warm, rose)

    let w = 1, h = 1, ratio = 0
    const size = () => {
      w = el.clientWidth
      h = el.clientHeight
      renderer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    size()

    // the marks: [element, what it follows, its text]
    const tags = [...marks.current!.querySelectorAll<HTMLElement>('.tag')], box = marks.current!.querySelector<HTMLElement>('.bbox')!
    const v = new THREE.Vector3(), look = new THREE.Vector3()
    const screen = (p: THREE.Vector3) => (p.project(cam), [(p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h])
    const deg = (r: number) => `${Math.round((r * 180) / Math.PI)}°`

    // The mug sits at radius R on bearing A0. The arm carries it round to A1, to the left, and sets it down.
    const R = 1.25, A0 = -0.35, A1 = 0.75, HOLD = 0.47
    let shown = -1, last = 0
    const draw = (p: number) => {
      last = p
      // arrive as big pixels, resolve to sharp over the first tenth of the scroll
      const want = Math.max(0.05, Math.round(lerp(0.05, 1, p / 0.1) * 20) / 20) * sharp
      if (want !== ratio) {
        renderer.setPixelRatio((ratio = want))
        renderer.setSize(w, h)
      }
      const yaw = lerp(lerp(A0 + 0.7, A0, p / 0.25), A1, (p - 0.62) / 0.38)
      const r = lerp(0.8, R, p / 0.25)
      // wrist height: come in high, drop onto the mug, lift, then lower again while turning
      const y = lerp(lerp(lerp(lerp(1.7, 1.1, p / 0.25), 0.5, (p - 0.25) / 0.12), 1.2, (p - HOLD) / 0.15), 0.5, (p - 0.78) / 0.22)
      const open = lerp(1, 0.3, (p - 0.37) / 0.1)
      arm.solve(r * Math.cos(yaw), y, -r * Math.sin(yaw), open)
      const held = p >= HOLD, a = held ? yaw : A0
      mug.position.set(R * Math.cos(a), held ? y - 0.5 : 0, -R * Math.sin(a))
      mug.rotation.y = a - A0 // it turns with the claw, which is what the handle shows
      // the camera drifts round as you scroll, and closes in on the claw for the grip and the lift
      const zoom = lerp(0, 1, (p - 0.2) / 0.14) * (1 - lerp(0, 1, (p - 0.62) / 0.14))
      const o = lerp(-0.45, 0.1, p) + mouse.x * 0.16, dist = 5 - 1.0 * zoom
      cam.position.set(Math.sin(o) * dist, 1.9 - 0.3 * zoom - mouse.y * 0.25, Math.cos(o) * dist)
      arm.root.updateMatrixWorld(true)
      arm.parts.wrist.getWorldPosition(v)
      cam.lookAt(look.set(0.45, 0.7, 0).lerp(v.setY(v.y - 0.2), zoom * 0.5))
      cam.updateMatrixWorld()
      renderer.render(scene, cam)

      // mark up the frame once it is sharp
      const on = p > 0.1 && p < 0.985 ? '1' : '0'
      const action = p < 0.25 ? 'reach' : p < HOLD ? 'grasp' : p < 0.62 ? 'lift' : p < 0.9 ? 'carry' : 'place'
      const say = [`joint 1 · ${deg(arm.parts.shoulder.rotation.z)}`, `joint 2 · ${deg(arm.parts.elbow.rotation.z)}`, `gripper · ${Math.round(open * 100)}% open · action: ${action}`]
      ;[arm.parts.shoulder, arm.parts.elbow, arm.parts.wrist].forEach((part, i) => {
        const [x, yy] = screen(part.getWorldPosition(v))
        tags[i].style.opacity = on
        tags[i].textContent = say[i]
        // to the right of the joint, or to its left when that would run off the frame
        const tw = tags[i].offsetWidth, tx = x + 26 + tw > w ? x - 26 - tw : x + 26
        tags[i].style.transform = `translate(${Math.max(0, tx)}px, ${yy - 30 + i * 4}px)`
      })
      const [bx, by] = screen(v.copy(mug.position)), top = screen(v.copy(mug.position).setY(mug.position.y + 0.27))[1]
      const half = (by - top) * 0.62
      box.style.opacity = on
      box.style.transform = `translate(${bx - half}px, ${top - 4}px)`
      box.style.width = `${half * 2.2}px`
      box.style.height = `${by - top + 10}px`
      box.firstElementChild!.textContent = `mug 0.97${held && p < 0.9 ? ' · held' : ''}`

      const now = Math.min(MISSION.length - 1, Math.floor(p * MISSION.length))
      if (now !== shown) setStep((shown = now)) // re-render the cards only when the lit one changes
    }
    const onSize = () => { size(); draw(last) }
    addEventListener('resize', onSize)
    draw(calm ? 1 : 0)
    let queued = 0
    redraw = () => { queued ||= requestAnimationFrame(() => { queued = 0; draw(last) }) }
    const st = ScrollTrigger.create({ trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.6, onUpdate: (s) => draw(s.progress) })

    return () => {
      st.kill()
      stop()
      cancelAnimationFrame(queued)
      removeEventListener('resize', onSize)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <section id="arm" ref={section} className="relative h-[230vh] md:h-[300vh]" aria-label="Our mission: data democratization">
      <div ref={glow} className="glow" aria-hidden />
      <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl content-center gap-4 px-4 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-10">
        <div className="order-2 md:order-1">
          <p className="label">Data democratization</p>
          <h2 className="text-2xl font-semibold md:text-5xl">Robot data, <span className="text-flow">open to everyone.</span></h2>
          <ol className="mt-3 space-y-1.5 md:mt-8 md:space-y-2">
            {MISSION.map(([t, d], i) => (
              <li key={t} className={`tile tile-row p-3 transition-opacity duration-500 md:p-4 ${step === i ? 'on-flow' : 'opacity-60'}`}>
                <Dither tone="flow" seed={i * 1.7 + 2} className={`transition-opacity duration-500 ${step === i ? 'opacity-100' : 'opacity-0'}`} />
                <h3 className="flex items-baseline gap-3 text-lg font-semibold md:text-xl"><span className="text-xs font-normal tabular-nums opacity-70">0{i + 1}</span>{t}</h3>
                <p className={`mt-1 pl-7 text-sm ${step === i ? '' : 'text-paper/80 max-md:hidden'}`}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative order-1 h-[38dvh] md:order-2 md:h-[76dvh]" aria-hidden>
          <div ref={stage} className="h-full [mask-image:radial-gradient(closest-side,black_86%,transparent)]" />
          {/* labels over the frame, placed by the draw loop */}
          <div ref={marks} className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="bbox opacity-0"><span /></div>
            <div className="tag opacity-0" />
            <div className="tag opacity-0" />
            <div className="tag opacity-0" />
          </div>
        </div>
      </div>
    </section>
  )
}
