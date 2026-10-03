// Browser only. Samples frames from a video file and measures quality live,
// before anything is uploaded.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { dhash, type Metrics } from './score'

const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const cached: Partial<Record<'IMAGE' | 'VIDEO', Promise<HandLandmarker>>> = {}

/** wasm is copied from node_modules into /public/mediapipe by the build script. */
export function getHands(mode: 'IMAGE' | 'VIDEO') {
  return (cached[mode] ??= FilesetResolver.forVisionTasks('/mediapipe').then((files) =>
    HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: mode, numHands: 2 }),
  ))
}

const once = (el: HTMLElement, ev: string, ms = 5000) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`video did not respond (${ev})`)), ms)
    el.addEventListener(ev, () => (clearTimeout(t), res()), { once: true })
  })

const SAMPLES = 6
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)

export async function analyze(file: File, on: (m: Metrics, stage: string) => void) {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = URL.createObjectURL(file)
  try {
    await once(v, 'loadedmetadata', 15000)
    await v.play().then(() => v.pause()).catch(() => {}) // iOS will not paint frames until played once
    if (!isFinite(v.duration)) {
      // MediaRecorder webm has no duration until you seek past the end
      v.currentTime = 1e101
      await once(v, 'timeupdate').catch(() => {})
    }
    const duration = isFinite(v.duration) ? v.duration : 0
    const m: Metrics = { width: v.videoWidth, height: v.videoHeight, duration }
    on({ ...m }, 'Loading hand model')

    const canvas = (w: number) => Object.assign(document.createElement('canvas'), { width: w, height: Math.round((w * v.videoHeight) / v.videoWidth) || w })
    const small = canvas(320), big = canvas(512)
    const ctx = small.getContext('2d', { willReadFrequently: true })!
    const gray = () => {
      ctx.drawImage(v, 0, 0, small.width, small.height)
      const d = ctx.getImageData(0, 0, small.width, small.height).data
      const g = new Float32Array(d.length / 4)
      for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
      return g
    }
    const seek = async (t: number) => {
      v.currentTime = t
      await once(v, 'seeked')
    }
    const hands = await getHands('IMAGE').catch(() => null) // offline or blocked: skip the hands check

    // Fingerprint for exact copies: SHA-256 of the first megabyte plus the size, so a 500MB file is not read into memory.
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([...new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer()), ...new TextEncoder().encode(String(file.size))]))
    const fingerprint = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    const hashes: string[] = [] // one perceptual hash per sampled frame, for re-encoded copies

    const bright: number[] = [], sharp: number[] = [], shake: number[] = [], frames: string[] = []
    let seen = 0, thumb = ''
    for (let i = 0; i < SAMPLES; i++) {
      on({ ...m }, `Checking frame ${i + 1} of ${SAMPLES}`)
      const t = (duration * (i + 0.5)) / SAMPLES
      await seek(t)
      const g = gray(), W = small.width
      bright.push(mean(Array.from(g)))
      hashes.push(dhash(g, W, small.height))
      // variance of the 4-neighbour Laplacian: low means blurry
      const lap: number[] = []
      for (let p = W; p < g.length - W; p++) lap.push(4 * g[p] - g[p - 1] - g[p + 1] - g[p - W] - g[p + W])
      const lm = mean(lap)
      sharp.push(mean(lap.map((x) => (x - lm) ** 2)))

      big.getContext('2d')!.drawImage(v, 0, 0, big.width, big.height)
      frames.push(big.toDataURL('image/jpeg', 0.7))
      if (i === SAMPLES >> 1) thumb = small.toDataURL('image/jpeg', 0.6)
      if (hands && hands.detect(big).landmarks.length) seen++

      if (duration > 0.3) {
        await seek(Math.min(t + 0.15, duration - 0.01))
        const g2 = gray()
        let d = 0
        for (let p = 0; p < g.length; p++) d += Math.abs(g[p] - g2[p])
        shake.push(d / g.length)
      }
      m.brightness = mean(bright)
      m.sharpness = mean(sharp)
      if (shake.length) m.steadiness = mean(shake)
      if (hands) m.hands = seen / (i + 1)
      on({ ...m }, `Checked frame ${i + 1} of ${SAMPLES}`)
    }
    on({ ...m }, '')
    return { metrics: m, frames, thumb, hashes, fingerprint }
  } finally {
    URL.revokeObjectURL(v.src)
  }
}
