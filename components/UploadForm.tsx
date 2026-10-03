'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import { analyze } from '@/lib/quality'
import ClipStats from './ClipStats'
import { HOLD_DAYS, checks, technical, completeness, finalScore, payout, type Labels, type Metrics } from '@/lib/score'

type Dup = { kind: string; own: boolean }
type Result = {
  id: string; quality_score: number; price: number; aiError: string | null; duplicate?: Dup | null; unverified?: string
  bounty?: { paid: number; title?: string; reason?: string } | null
  ai: null | { reasons: string[]; flags: string[]; skill: { level: string; evidence: string }; labels?: Labels }
}

// The pipeline, in order, with the open-source piece that does each step.
// The third value is the phase the step belongs to: 0 reading, 1 analysing, 2 originality, 3 upload, 4 server.
const STEPS = [
  ['Read frames', 'browser video decoder', 0],
  ['Quality checks', 'light, sharpness, steadiness', 1],
  ['Hand tracking', 'MediaPipe Hands', 1],
  ['Object detection', 'EfficientDet-Lite0', 1],
  ['Scene classification', 'EfficientNet-Lite0', 1],
  ['Originality', 'perceptual hash', 2],
  ['Upload', 'direct to storage', 3],
  ['Label with Kimi', 'vision language model', 4],
  ['Score and price', 'live market rate', 4],
] as const
const HANDS_ONLY = ['Hand tracking', 'Object detection', 'Scene classification'] // skipped for screen recordings
const pct = (x = 0) => `${Math.round(x * 100)}%`

/**
 * Takes one recording: hands filmed live on /record (with its episode file), a screen recording, or a video from the gallery,
 * shows it moving through the processing pipeline, and ends on the breakdown.
 */
export default function UploadForm({ initialFile: file, episode, requestId, kind, years = 0 }: { initialFile: File; episode?: object; requestId?: string; kind?: 'screen'; years?: number }) {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics>({})
  const [frame, setFrame] = useState(0) // frames analysed so far, of 6
  const [shots, setShots] = useState<Awaited<ReturnType<typeof analyze>> | null>(null)
  const [dup, setDup] = useState<Dup | 'clear' | null>(null) // null = not checked yet
  const consent = true // given by pressing Record or choosing the file: the terms are shown beside those buttons
  const [sent, setSent] = useState<number | null>(null) // upload progress 0..1, null before submit
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const live = !!episode

  useEffect(() => {
    let on = true
    analyze(file, (m, s) => on && (setMetrics(m), setFrame((n) => Math.max(n, +(s.match(/Checked frame (\d)/)?.[1] ?? 0)))), { screen: kind === 'screen' })
      .then(async (r) => {
        if (!on) return
        setShots(r)
        setFrame(6)
        const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: r.fingerprint, hashes: r.hashes }) }).then((x) => x.json()).catch(() => null)
        if (on) setDup(res?.duplicate ?? 'clear')
      })
      .catch((e) => on && setError(`Could not read this video: ${e.message}`))
    return () => { on = false }
  }, [file, kind])

  // Labels are added afterwards on the report page. A clip recorded for a request takes the request's labels on the server.
  const labels: Labels = {}
  const comp = completeness(labels)
  const estimate = finalScore(technical(metrics), comp)
  const copy = dup && dup !== 'clear' ? dup : null
  const ready = !!shots && dup !== null

  // how far along: a step is done once the clip is past its phase, and running while the clip is in it
  const phase = result ? 5 : verifying ? 4 : sent !== null ? 3 : ready ? 2.5 : shots ? 2 : frame > 0 ? 1 : 0
  const steps = kind === 'screen' ? STEPS.filter((s) => !HANDS_ONLY.includes(s[0])) : STEPS
  const progress = result ? 1 : verifying ? 0.9 : sent !== null ? 0.6 + 0.25 * sent : ready ? 0.6 : shots ? 0.55 : 0.05 + 0.45 * (frame / 6)
  const good = result && !result.duplicate && !result.unverified

  async function submit() {
    setError('')
    try {
      if (!(await fetch('/api/upload')).ok) return setError('signin')
      const opts = { access: 'public' as const, handleUploadUrl: '/api/blob' }
      setSent(0)
      const video = await upload(file.name, file, { ...opts, onUploadProgress: (p) => setSent(p.percentage / 100) })
      // a live recording carries its episode file: hand poses, motion sensors, the challenge, and the consent record
      const signed = episode && { ...episode, consent: { owns_footage: true, workplace_permission: true, license: 'non-exclusive', timestamp: new Date().toISOString() } }
      const ep = signed && (await upload(file.name.replace(/\.\w+$/, '') + '.episode.json', new Blob([JSON.stringify(signed)], { type: 'application/json' }), opts))
      setVerifying(true)
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: video.url, episode_url: ep ? ep.url : undefined, request_id: requestId, capture: kind, consent, labels, metrics, frames: shots?.frames ?? [], thumb: shots?.thumb, hashes: shots?.hashes, fingerprint: shots?.fingerprint, labelsets: shots?.labelsets }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResult(json)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Upload failed')
      setSent(null)
    } finally {
      setVerifying(false)
    }
  }

  // Runs straight through: the moment analysis and the originality check are done, the rest starts by itself.
  const started = useRef(false)
  useEffect(() => {
    if (ready && !started.current) (started.current = true), submit()
  })

  return (
    <div className="space-y-4">
      {/* the pipeline: a bar, and one tile per step that lights as the clip reaches it */}
      <section className={`card p-5 transition-shadow duration-700 ${good ? 'glow-green' : ''}`} aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{result ? (good ? 'Processed' : 'Processed, not listed') : error ? 'Stopped before finishing' : 'Processing your clip'}</h2>
          <span className={`text-2xl font-light tabular-nums ${good ? 'text-emerald-300' : ''}`}>{pct(progress)}</span>
        </div>
        <p className="muted mt-1 text-xs">{file.name}, {(file.size / 1e6).toFixed(1)} MB. {live ? 'Recorded live in the app.' : kind === 'screen' ? 'Screen recording, captured in the app.' : 'Uploaded from your gallery.'}</p>
        <div className="bar mt-4 !h-2"><i className={good ? '!bg-emerald-400 !bg-none' : ''} style={{ width: pct(progress) }} /></div>
        <ol className="mt-4 grid grid-cols-3 gap-2 md:flex">
          {steps.map(([name, tool, at]) => {
            const state = at < phase ? 'done' : at === phase ? 'now' : 'wait'
            return (
              <li key={name} className={`rounded-xl p-2.5 md:flex-1 transition-colors duration-500 ${state === 'done' ? (good ? 'bg-emerald-400/15' : 'bg-white/[.07]') : state === 'now' ? 'card-warm' : 'bg-white/[.025] opacity-50'}`}>
                <span className={`block h-1.5 w-1.5 rounded-full ${state === 'done' ? 'bg-emerald-400' : state === 'now' ? 'pulse bg-amber-300' : 'bg-white/30'}`} aria-hidden />
                <p className="mt-2 text-xs font-medium leading-tight">{name}</p>
                <p className="muted mt-0.5 text-[10px] leading-tight">{tool}</p>
              </li>
            )
          })}
        </ol>
      </section>

      {result ? (
        // the breakdown
        <section className="space-y-3">
          <div className={`card p-5 ${good ? 'card-warm' : ''}`}>
            {result.duplicate ? (
              <p className="text-sm">{result.duplicate.own ? 'You already submitted this clip.' : 'This matches a clip that someone already submitted.'} A clip can only be sold once, by the person who filmed it.</p>
            ) : result.unverified ? (
              <p className="text-sm">We could not verify this was filmed live. {result.unverified}. Record again and complete the challenge.</p>
            ) : (
              <>
                <p className="label !text-paper/70">Quality score</p>
                <p className="text-6xl font-light tracking-tight tabular-nums">{result.quality_score}<span className="text-2xl text-paper/60"> / 5</span></p>
                <p className="mt-3 text-sm">Listed at ${result.price}. You get ${payout(result.price).toFixed(2)} each time it sells, released after {HOLD_DAYS} days.</p>
                {result.bounty?.paid ? <p className="mt-2 text-sm"><span className="chip bg-ink/40">Request accepted</span> ${result.bounty.paid} guaranteed for &ldquo;{result.bounty.title}&rdquo;.</p> : result.bounty ? <p className="mt-2 text-sm text-amber-200">Not accepted for the request: {result.bounty.reason}.</p> : null}
                {!live && kind !== 'screen' && <p className="mt-2 text-xs text-paper/70">Shown to buyers as a gallery upload, not verified live.</p>}
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/sell/${result.id}`} className="btn !min-h-10 text-sm">Open the full report</Link>
              <a href={live ? '/record' : '/sell'} className="btn btn-ghost !min-h-10 text-sm">Add another</a>
            </div>
          </div>
          {good && <ClipStats score={result.quality_score} metrics={metrics} sets={shots?.labelsets ?? {}} earn={payout(result.price)} />}
        </section>
      ) : (
        <section className="card space-y-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">Estimated quality</p>
              <p className="text-4xl font-light tracking-tight tabular-nums">{frame ? estimate : '-'}<span className="muted text-lg"> / 5</span></p>
            </div>
            <p className="flex flex-wrap gap-1.5">
              {checks(metrics).map((c) => <span key={c.key} className={`stat ${c.score < 0.7 ? 'stat-warm' : ''}`} title={c.score < 0.7 ? c.tip : undefined}>{c.label}<span className="muted">{c.value}</span></span>)}
              {dup && <span className={`stat ${copy ? 'stat-warm' : ''}`}>{copy ? 'Copy of an existing clip' : 'Original'}</span>}
            </p>
          </div>
          {error === 'signin' ? (
            <p className="text-sm">Sign in to finish processing. <Link className="underline" href="/login?mode=register">Create an account</Link> or <Link className="underline" href="/login">sign in</Link>, then record again.</p>
          ) : error ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-300">{error}</p>
              <button className="btn !min-h-10 text-sm" onClick={submit}>Try again</button>
            </div>
          ) : (
            <p className="muted text-sm">{verifying ? 'Checking it is real and labelling it' : sent !== null ? `Uploading ${pct(sent)}` : 'Analysing on your device'}. Nothing to press: it finishes on its own, and you can add labels afterwards to raise the score.</p>
          )}
        </section>
      )}
    </div>
  )
}
