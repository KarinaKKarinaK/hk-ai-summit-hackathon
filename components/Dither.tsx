'use client'

import { useEffect, useRef } from 'react'

type RGB = [number, number, number]
const COAL: RGB = [38, 36, 42], PLUM: RGB = [42, 23, 16], ROSE: RGB = [66, 36, 22], FLAME: RGB = [238, 115, 64], BLUSH: RGB = [243, 188, 174], PINK: RGB = [250, 222, 208]
// dark to burnt orange to orange to blush to a paler blush: one family, no second hue
const FLOW: RGB[] = [[20, 17, 22], [150, 62, 22], FLAME, BLUSH, PINK]
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const CELL = 7 // px per halftone cell
const css = (c: RGB) => `rgb(${c[0]} ${c[1]} ${c[2]})`

/** A slow swirl: two sine waves, each bent by the other axis. Same seed, same picture. */
export function flow(x: number, y: number, seed: number): number {
  const wx = x + 0.3 * Math.sin(2.3 * y + seed), wy = y + 0.3 * Math.sin(1.9 * x + seed * 1.7)
  return Math.min(1, Math.max(0, 0.5 + 0.27 * Math.sin(3.1 * wx + 1.7 * wy + seed * 2.1) + 0.23 * Math.sin(4.3 * wy - 2.2 * wx + seed)))
}

/**
 * Poster background: a flowing orange gradient broken into square halftone dots (ordered dithering).
 * flow is the full swirl. coal, flame and plum are flat colours with dots drifting in, plum's kept dim to sit under text.
 * Drawn on a canvas that fills its parent, which must be positioned. A ripple runs through the dots, and the swirl shifts under the pointer.
 */
export default function Dither({ tone = 'flow', seed = 1, className = '', label }: { tone?: 'flow' | 'coal' | 'flame' | 'plum'; seed?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const tag = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const c = ref.current!, host = c.parentElement!
    let drift = seed, raf = 0, wave = 0, cw = 0, ch = 0
    const small = document.createElement('canvas')
    const paint = () => {
      const w = c.clientWidth, h = c.clientHeight
      if (!w || !h) return
      const dpr = Math.min(devicePixelRatio, 2), cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL)
      if (w !== cw || h !== ch) {
        c.width = (cw = w) * dpr
        c.height = (ch = h) * dpr
      }
      const g = c.getContext('2d')!
      const flat = tone === 'coal' ? COAL : tone === 'flame' ? FLAME : tone === 'plum' ? PLUM : null
      // the smooth layer is painted one pixel per cell, then stretched
      small.width = cols
      small.height = rows
      const sg = small.getContext('2d')!, img = sg.createImageData(cols, rows)
      const dots: [number, number, string][] = []
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const v = flow((i * CELL) / 420, (j * CELL) / 420, drift), o = (j * cols + i) * 4
        const p = v * (FLOW.length - 1), k = Math.min(FLOW.length - 2, Math.floor(p)), t = p - k
        const base = flat ?? (FLOW[k].map((a, n) => a + (FLOW[k + 1][n] - a) * t) as RGB)
        img.data.set([...base, 255], o)
        // how many dots: on the swirl they thicken toward the next colour, on a flat tone they drift in where the swirl peaks
        const density = (flat ? (v - 0.55) / 0.45 : k === 0 ? t * 0.45 : t) + 0.2 * Math.sin(i * 0.2 + j * 0.15 - wave) // a ripple runs through the dots
        if ((BAYER[(j & 3) * 4 + (i & 3)] + 0.5) / 16 < density) dots.push([i, j, css(tone === 'plum' ? ROSE : !flat && k === 3 ? PINK : BLUSH)])
      }
      sg.putImageData(img, 0, 0)
      g.imageSmoothingEnabled = true
      g.drawImage(small, 0, 0, c.width, c.height)
      const s = CELL * dpr, d = s * 0.52
      for (const [i, j, col] of dots) {
        g.fillStyle = col
        g.fillRect(i * s + (s - d) / 2, j * s + (s - d) / 2, d, d)
      }
    }
    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(c)
    // a ripple of dots crosses the card while it is on screen, about eleven frames a second. The card fades up the first time it is seen.
    let seen = false, then = 0, loop = 0
    const io = new IntersectionObserver(([e]) => (seen = e.isIntersecting) && host.classList.add('in'))
    io.observe(c)
    const tick = (t: number) => {
      loop = requestAnimationFrame(tick)
      if (!seen || t - then < 90) return
      then = t
      wave = t * 0.0022
      paint()
    }
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) loop = requestAnimationFrame(tick)
    // the swirl shifts as the pointer moves across the card, and a poster leans toward it
    const tilts = host.classList.contains('tile-lift')
    const leave = () => {
      host.style.transform = ''
      if (tag.current) tag.current.style.opacity = '0'
    }
    const move = (e: PointerEvent) => {
      drift = seed + (e.clientX + e.clientY) * 0.0016
      if (e.pointerType !== 'mouse') return
      const r = host.getBoundingClientRect()
      // the label rides beside the cursor, only while it is over this card
      if (tag.current) {
        tag.current.style.opacity = '0.78'
        tag.current.style.transform = `translate(${e.clientX - r.left + 16}px, ${e.clientY - r.top + 18}px)`
      }
      if (tilts) {
        host.style.transform = `perspective(700px) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 9}deg) rotateX(${(0.5 - (e.clientY - r.top) / r.height) * 9}deg)`
      }
      raf ||= requestAnimationFrame(() => { raf = 0; paint() })
    }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)
    return () => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(loop); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf) }
  }, [tone, seed])

  return (
    <>
      <canvas ref={ref} aria-hidden className={`absolute inset-0 -z-10 h-full w-full ${className}`} />
      {label && <span ref={tag} aria-hidden className="cursor-tag">{label}</span>}
    </>
  )
}
