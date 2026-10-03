'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import { analyze } from '@/lib/quality'
import ClipStats from './ClipStats'
import { LABELS, BASE_RATE, HOLD_DAYS, checks, technical, completeness, finalScore, listPrice, payout, type Labels, type LabelSet, type Metrics } from '@/lib/score'

type Dup = { kind: string; own: boolean }
type Result = {
  id: string; quality_score: number; price: number; aiError: string | null; duplicate?: Dup | null; unverified?: string
  bounty?: { paid: number; title?: string; reason?: string } | null
  ai: null | { reasons: string[]; flags: string[]; skill: { level: string; evidence: string }; labels?: Labels }
}

// The pipeline, in order, with the open-source piece that does each step.
const STEPS = [
  ['Read frames', 'browser video decoder'],
  ['Quality checks', 'light, sharpness, steadiness'],
  ['Hand tracking', 'MediaPipe Hands'],
  ['Object detection', 'EfficientDet-Lite0'],
  ['Scene classification', 'EfficientNet-Lite0'],
  ['Originality', 'perceptual hash'],
  ['Upload', 'direct to storage'],
  ['Verify and label', 'Kimi vision model'],
  ['Score and price', 'live market rate'],
]
const pct = (x = 0) => `${Math.round(x * 100)}%`

/**
 * Takes one video, recorded live on /record (with its episode file) or picked from the gallery,
 * shows it moving through the processing pipeline, and ends on the breakdown.
 */
export default function UploadForm({ initialFile: file, episode, requestId, years = 0 }: { initialFile: File; episode?: object; requestId?: string; years?: number }) {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics>({})
  const [frame, setFrame] = useState(0) // frames analysed so far, of 6
  const [shots, setShots] = useState<Awaited<ReturnType<typeof analyze>> | null>(null)
  const [dup, setDup] = useState<Dup | 'clear' | null>(null) // null = not checked yet
  const [f, setF] = useState({ title: '', description: '', steps: '', perspective: '', task: '', industry: '', device: '', outcome: '', tools: '' })
  const [consent, setConsent] = useState(false)
  const [sent, setSent] = useState<number | null>(null) // upload progress 0..1, null before submit
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const live = !!episode

  useEffect(() => {
    let on = true
    analyze(file, (m, s) => on && (setMetrics(m), setFrame((n) => Math.max(n, +(s.match(/Checked frame (\d)/)?.[1] ?? 0)))))
      .then(async (r) => {
        if (!on) return
        setShots(r)
        setFrame(6)
        const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: r.fingerprint, hashes: r.hashes }) }).then((x) => x.json()).catch(() => null)
        if (on) setDup(res?.duplicate ?? 'clear')
      })
      .catch((e) => on && setError(`Could not read this video: ${e.message}`))
    return () => { on = false }
  }, [file])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const labels: Labels = { perspective: f.perspective, task: f.task, industry: f.industry, device: f.device, outcome: f.outcome, tools: f.tools.split(',').map((t) => t.trim()).filter(Boolean) }
  const comp = completeness(labels, f.description, f.steps)
  const estimate = finalScore(technical(metrics), comp)
  const copy = dup && dup !== 'clear' ? dup : null
  const ready = !!shots && dup !== null

  // how far along: steps before `doing` are done, `doing` to `until` are running
  const [doing, until] = result ? [9, 9] : verifying ? [7, 8] : sent !== null ? [6, 6] : ready ? [6, 5] : shots ? [5, 5] : frame > 0 ? [1, 4] : [0, 0]
  const progress = result ? 1 : verifying ? 0.9 : sent !== null ? 0.6 + 0.25 * sent : ready ? 0.6 : shots ? 0.55 : 0.05 + 0.45 * (frame / 6)
  const good = result && !result.duplicate && !result.unverified

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
        body: JSON.stringify({ video_url: video.url, episode_url: ep ? ep.url : undefined, request_id: requestId, consent, title: f.title, description: f.description, steps: f.steps, labels, metrics, frames: shots?.frames ?? [], thumb: shots?.thumb, hashes: shots?.hashes, fingerprint: shots?.fingerprint, labelsets: shots?.labelsets }),
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

  const select = (k: 'perspective' | 'task' | 'industry' | 'device' | 'outcome', name: string) => (
    <div>
      <label className="label" htmlFor={k}>{name}</label>
      <select id={k} className="input" value={f[k]} onChange={set(k)}>
        <option value="">Choose</option>
        {LABELS[k].map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
  const found = (title: string, rows?: LabelSet) =>
    rows?.length ? (
      <div>
        <p className="label">{title}</p>
        <p className="flex flex-wrap gap-1.5">{rows.slice(0, 6).map((l) => <span key={l.name} className="stat">{l.name}<span className="muted">{pct(l.confidence)}</span></span>)}</p>
      </div>
    ) : null

  return (
    <div className="space-y-4">
      {/* the pipeline: a bar, and one tile per step that lights as the clip reaches it */}
      <section className={`card p-5 transition-shadow duration-700 ${good ? 'glow-green' : ''}`} aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{result ? (good ? 'Processed' : 'Processed, not listed') : ready && sent === null ? 'Analysed. Confirm to finish' : 'Processing your clip'}</h2>
          <span className={`text-2xl font-light tabular-nums ${good ? 'text-emerald-300' : ''}`}>{pct(progress)}</span>
        </div>
        <p className="muted mt-1 text-xs">{file.name}, {(file.size / 1e6).toFixed(1)} MB. {live ? 'Recorded live in the app.' : 'Uploaded from your gallery.'}</p>
        <div className="bar mt-4 !h-2"><i className={good ? '!bg-emerald-400 !bg-none' : ''} style={{ width: pct(progress) }} /></div>
        <ol className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-9">
          {STEPS.map(([name, tool], i) => {
            const state = i < doing ? 'done' : i <= until ? 'now' : 'wait'
            return (
              <li key={name} className={`rounded-xl p-2.5 transition-colors duration-500 ${state === 'done' ? (good ? 'bg-emerald-400/15' : 'bg-white/[.07]') : state === 'now' ? 'card-warm' : 'bg-white/[.025] opacity-50'}`}>
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
                {!live && <p className="mt-2 text-xs text-paper/70">Shown to buyers as a gallery upload, not verified live.</p>}
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
        <form onSubmit={submit} className="card space-y-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label">Estimated quality</p>
              <p className="text-4xl font-light tracking-tight tabular-nums">{frame ? estimate : '-'}<span className="muted text-lg"> / 5</span></p>
            </div>
            <p className="flex flex-wrap gap-1.5">
              {checks(metrics).map((c) => <span key={c.key} className={`stat ${c.score < 0.7 ? 'stat-warm' : ''}`} title={c.score < 0.7 ? c.tip : undefined}>{c.label}<span className="muted">{c.value}</span></span>)}
              {dup && <span className={`stat ${copy ? 'stat-warm' : ''}`}>{copy ? 'Copy of an existing clip' : 'Original'}</span>}
            </p>
            <p className="text-right text-sm"><span className="muted block text-xs">Est. payout per sale</span>${copy ? '0.00' : payout(listPrice(BASE_RATE, (metrics.duration ?? 0) / 60, estimate, years)).toFixed(2)}</p>
          </div>
          {copy && <p role="alert" className="text-sm text-amber-200">{copy.own ? 'You already submitted this clip.' : 'This matches a clip someone already submitted.'} It can be saved but will not be listed or paid.</p>}
          {!live && <p className="muted text-sm">Gallery uploads are listed as not verified live, and cannot fill a paid request. Record in the app for verified clips.</p>}

          <details className="rounded-xl bg-white/[.04] p-4" open={comp > 0}>
            <summary className="cursor-pointer text-sm font-medium">Add labels to raise your score ({Math.round(comp * 7)} of 7)</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label" htmlFor="title">Title</label>
                <input id="title" className="input" maxLength={120} placeholder="Brake pad replacement, front axle" value={f.title} onChange={set('title')} />
              </div>
              {select('task', 'Task')}
              {select('industry', 'Industry')}
              {select('perspective', 'Perspective')}
              {select('device', 'Device')}
              {select('outcome', 'How did it go')}
              <div>
                <label className="label" htmlFor="tools">Tools used, comma separated</label>
                <input id="tools" className="input" placeholder="Torque wrench, caliper tool" value={f.tools} onChange={set('tools')} />
              </div>
              <div>
                <label className="label" htmlFor="description">What is being done</label>
                <textarea id="description" className="input" rows={3} maxLength={1000} value={f.description} onChange={set('description')} />
              </div>
              <div>
                <label className="label" htmlFor="steps">Steps, in your own words</label>
                <textarea id="steps" className="input" rows={3} maxLength={2000} placeholder={'1. Loosen caliper bolts\n2. Compress piston'} value={f.steps} onChange={set('steps')} />
              </div>
            </div>
          </details>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>I filmed this myself, I grant a non-exclusive training licence, anyone identifiable in it agreed, and I had permission to film where I did. <span className="muted">You keep ownership and can withdraw it later.</span></span>
          </label>
          {error === 'signin' ? (
            <p className="text-sm">You need an account to finish. <Link className="underline" href="/login?mode=register">Create one</Link> or <Link className="underline" href="/login">sign in</Link>, then add the clip again.</p>
          ) : error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button className="btn w-full" disabled={!ready || sent !== null}>{sent !== null ? (verifying ? 'Verifying and labelling' : `Uploading ${pct(sent)}`) : ready ? 'Confirm and finish processing' : 'Analysing'}</button>
        </form>
      )}
    </div>
  )
}
