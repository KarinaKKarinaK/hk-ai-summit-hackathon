'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { buildArm, buildMug, addLights } from '@/lib/arm'

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const MISSION = [
  ['Open to every lab', 'Any robotics company, startup or university can license the same data, on the same terms.'],
  ['Owned by the people who do the work', 'Sellers keep their footage and earn every time it is licensed.'],
  ['Priced in the open', 'Rates follow real demand on a public index. Nobody sets them behind closed doors.'],
  ['Proof, not trust', 'Every clip carries the record of how it was filmed, labelled and checked.'],
]

/**
 * Landing page 3D: one arm and one glass mug, driven by scroll. Reach, grip, lift, then swing left and set it down.
 * Also runs the page's smooth scroll and the tilt-in of sections marked data-tilt.
 */
export default function ArmScene() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
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

    // sections swing up into place as they enter
    const ctx = gsap.context(() => {
      if (calm) return
      gsap.utils.toArray<HTMLElement>('[data-tilt]').forEach((t) =>
        gsap.from(t, { rotateX: 8, y: 48, opacity: 0, transformPerspective: 1200, transformOrigin: '50% 0%', ease: 'power2.out', scrollTrigger: { trigger: t, start: 'top 95%', end: 'top 60%', scrub: 0.8 } }),
      )
    })

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return () => { ctx.revert(); gsap.ticker.remove(raf); lenis?.destroy() } // no WebGL: the text still tells the story
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 50)
    addLights(scene, renderer)
    const arm = buildArm('graphite'), mug = buildMug()
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.05, 96), new THREE.MeshStandardMaterial({ color: 0x1c110a, roughness: 0.8, metalness: 0.05 }))
    table.position.y = -0.025
    table.receiveShadow = true
    scene.add(arm.root, table, mug)

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    size()
    addEventListener('resize', size)

    // The mug sits at radius R on bearing A0. The arm carries it round to A1, to the left, and sets it down.
    const R = 1.25, A0 = -0.35, A1 = 0.75, HOLD = 0.47
    let shown = -1
    const draw = (p: number) => {
      const yaw = lerp(lerp(A0 + 0.7, A0, p / 0.25), A1, (p - 0.62) / 0.38)
      const r = lerp(0.8, R, p / 0.25)
      // wrist height: come in high, drop onto the mug, lift, then lower again while turning
      const y = lerp(lerp(lerp(lerp(1.7, 1.1, p / 0.25), 0.5, (p - 0.25) / 0.12), 1.2, (p - HOLD) / 0.15), 0.5, (p - 0.78) / 0.22)
      arm.solve(r * Math.cos(yaw), y, -r * Math.sin(yaw), lerp(1, 0.3, (p - 0.37) / 0.1))
      const held = p >= HOLD, a = held ? yaw : A0
      mug.position.set(R * Math.cos(a), held ? y - 0.5 : 0, -R * Math.sin(a))
      mug.rotation.y = a - A0 // it turns with the claw, which is what the handle shows
      const o = lerp(-0.45, 0.1, p) // the camera drifts round as you scroll
      cam.position.set(Math.sin(o) * 5.0, 1.9, Math.cos(o) * 5.0)
      cam.lookAt(0.45, 0.7, 0)
      renderer.render(scene, cam)
      const now = Math.min(MISSION.length - 1, Math.floor(p * MISSION.length))
      if (now !== shown) setStep((shown = now)) // re-render the cards only when the lit one changes
    }
    draw(calm ? 1 : 0)
    const st = ScrollTrigger.create({ trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.6, onUpdate: (s) => draw(s.progress) })

    return () => {
      st.kill()
      ctx.revert()
      gsap.ticker.remove(raf)
      lenis?.destroy()
      removeEventListener('resize', size)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return (
    <section id="arm" ref={section} className="relative h-[230vh] md:h-[300vh]" aria-label="Our mission: data democratization">
      <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl content-center gap-4 px-4 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-10">
        <div className="order-2 md:order-1">
          <p className="label">Data democratization</p>
          <h2 className="text-2xl font-semibold md:text-5xl">Robot data, open to everyone.</h2>
          <ol className="mt-3 space-y-1.5 md:mt-8 md:space-y-2">
            {MISSION.map(([t, d], i) => (
              <li key={t} className={`rounded-2xl p-3 transition-all duration-500 md:p-4 ${step === i ? 'card-warm' : 'bg-white/[.03] opacity-60'}`}>
                <h3 className="flex items-baseline gap-3 text-lg font-semibold md:text-xl"><span className="muted text-xs font-normal tabular-nums">0{i + 1}</span>{t}</h3>
                <p className={`mt-1 pl-7 text-sm text-paper/80 ${step === i ? '' : 'max-md:hidden'}`}>{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <div ref={stage} className="order-1 h-[38dvh] [mask-image:radial-gradient(closest-side,black_72%,transparent)] md:order-2 md:h-[76dvh]" aria-hidden />
      </div>
    </section>
  )
}
