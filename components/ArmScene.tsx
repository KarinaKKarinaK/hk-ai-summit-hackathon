'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { buildArm, addLights } from '@/lib/arm'

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))
const STEPS = [
  ['Reach', 'A person films the task. Hand tracking turns it into a path a gripper can follow.'],
  ['Grip', 'Thumb and finger closing becomes open and close. No robot-specific joints, any gripper can replay it.'],
  ['Lift', 'The clip, the motion and the proof it is real are sold together as one training episode.'],
]

/**
 * Landing page 3D: one arm, one cup, driven by scroll. Reach, grip, lift.
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
    const lenis = calm ? null : new Lenis()
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
        gsap.from(t, { rotateX: 16, y: 70, opacity: 0, transformPerspective: 1000, transformOrigin: '50% 0%', ease: 'none', scrollTrigger: { trigger: t, start: 'top 92%', end: 'top 55%', scrub: true } }),
      )
    })

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return () => { ctx.revert(); gsap.ticker.remove(raf); lenis?.destroy() } // no WebGL: the text still tells the story
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(36, 1, 0.1, 50)
    addLights(scene)
    const arm = buildArm()
    // a table and a cup: the only props
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.04, 64), new THREE.MeshStandardMaterial({ color: 0x2a180a, roughness: 0.9 }))
    table.position.y = -0.02
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, 0.24, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x8e9a9b, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }))
    scene.add(arm.root, table, cup)

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
    size()
    addEventListener('resize', size)

    const CUP = { x: 1.15, y: 0.12, z: 0.25 }
    const draw = (p: number) => {
      const reach = p / 0.4, grip = (p - 0.4) / 0.15, lift = (p - 0.55) / 0.45
      const x = lerp(lerp(0.5, CUP.x, reach), 0.75, lift), y = lerp(lerp(1.5, CUP.y + 0.16, reach), 1.35, lift), z = lerp(lerp(-0.4, CUP.z, reach), 0.1, lift)
      arm.solve(x, y, z, lerp(1, 0.28, grip))
      // once gripped, the cup travels with the gripper
      cup.position.set(p > 0.55 ? x : CUP.x, p > 0.55 ? y - 0.16 : CUP.y, p > 0.55 ? z : CUP.z)
      const a = lerp(0.9, 0.25, p) // the camera drifts around as you scroll
      cam.position.set(Math.sin(a) * 5, 1.9, Math.cos(a) * 5)
      cam.lookAt(0.4, 0.75, 0)
      renderer.render(scene, cam)
      setStep(p < 0.4 ? 0 : p < 0.55 ? 1 : 2)
    }
    draw(calm ? 1 : 0)
    const st = ScrollTrigger.create({ trigger: sec, start: 'top top', end: 'bottom bottom', scrub: true, onUpdate: (s) => draw(s.progress) })

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
    <section id="arm" ref={section} className="relative h-[260vh]" aria-label="How a recording becomes robot data">
      <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl content-center gap-4 px-4 md:grid-cols-[1fr_1.25fr] md:items-center md:gap-10">
        <ol className="order-2 space-y-3 md:order-1">
          {STEPS.map(([t, d], i) => (
            <li key={t} className={`rounded-2xl p-4 transition-all duration-500 md:p-5 ${step === i ? 'card-warm' : 'opacity-45'}`}>
              <h2 className="text-2xl font-semibold md:text-3xl"><span className="muted mr-3 text-sm font-normal tabular-nums">0{i + 1}</span>{t}</h2>
              <p className={`mt-2 text-sm text-paper/80 ${step === i ? '' : 'max-md:hidden'}`}>{d}</p>
            </li>
          ))}
        </ol>
        <div ref={stage} className="order-1 h-[42dvh] md:order-2 md:h-[70dvh]" aria-hidden />
      </div>
    </section>
  )
}
