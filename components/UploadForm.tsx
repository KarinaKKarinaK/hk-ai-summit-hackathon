'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import { analyze } from '@/lib/quality'
import { LABELS, BASE_RATE, checks, technical, completeness, finalScore, listPrice, payout, type Labels, type Metrics } from '@/lib/score'

type Dup = { kind: string; own: boolean }
type Result = { id: string; quality_score: number; price: number; aiError: string | null; duplicate?: Dup | null; ai: null | { reasons: string[]; flags: string[]; skill: { level: string; evidence: string } } }
type Rates = Record<string, { rate: number; signal: string }>

export default function UploadForm({ initialFile, episode, years = 0, rates }: { initialFile?: File; episode?: object; years?: number; rates?: Rates }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [metrics, setMetrics] = useState<Metrics>({})
  const [stage, setStage] = useState('')
  const [shots, setShots] = useState<Awaited<ReturnType<typeof analyze>> | null>(null)
  const [dup, setDup] = useState<Dup | 'clear' | null>(null) // null = not checked yet
  const [f, setF] = useState({ title: '', description: '', steps: '', perspective: '', task: '', industry: '', device: '', outcome: '', tools: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!file) return
    let live = true
    setMetrics({}); setShots(null); setDup(null); setResult(null); setError(''); setStage('Reading video')
    analyze(file, (m, s) => live && (setMetrics(m), setStage(s)))
      .then(async (r) => {
        if (!live) return
        setShots(r)
        // originality check runs right after the quality check, before anything uploads
        const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fingerprint: r.fingerprint, hashes: r.hashes }) }).then((x) => x.json()).catch(() => null)
        if (live && res) setDup(res.duplicate ?? 'clear')
      })
      .catch((e) => live && setStage(`Could not read all frames: ${e.message}`))
    return () => { live = false }
  }, [file])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const labels: Labels = { perspective: f.perspective, task: f.task, industry: f.industry, device: f.device, outcome: f.outcome, tools: f.tools.split(',').map((t) => t.trim()).filter(Boolean) }
  const cs = checks(metrics)
  const comp = completeness(labels, f.description, f.steps)
  const live = finalScore(technical(metrics), comp)
  const minutes = (metrics.duration ?? 0) / 60
  const mkt = rates?.[f.task]
  const copy = dup && dup !== 'clear' ? dup : null
  const est = copy ? 0 : payout(listPrice(mkt?.rate ?? BASE_RATE, minutes, live, years))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setError('')
    try {
      if (!(await fetch('/api/upload')).ok) return setError('signin')
      const opts = { access: 'public' as const, handleUploadUrl: '/api/blob' }
      setBusy('Uploading 0%')
      const video = await upload(file.name, file, { ...opts, onUploadProgress: (p) => setBusy(`Uploading ${Math.round(p.percentage)}%`) })
      const ep = episode && (await upload(file.name.replace(/\.\w+$/, '') + '.episode.json', new Blob([JSON.stringify(episode)], { type: 'application/json' }), opts))
      setBusy('Vision model is reviewing your frames')
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // a clip recorded on /record carries its hand-motion trace, which a gallery upload cannot fake as easily
        body: JSON.stringify({ video_url: video.url, episode_url: ep?.url, capture: episode ? 'in-app' : 'gallery', consent, title: f.title, description: f.description, steps: f.steps, labels, metrics, frames: shots?.frames ?? [], thumb: shots?.thumb, hashes: shots?.hashes, fingerprint: shots?.fingerprint }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setResult(json)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Upload failed')
    } finally {
      setBusy('')
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

  if (result) {
    return (
      <div className="card p-5 space-y-3">
        {result.duplicate ? (
          <>
            <p className="label">Not listed</p>
            <p className="text-sm">{result.duplicate.own ? 'You already uploaded this clip.' : 'This matches a clip that someone already uploaded.'} A clip can only be sold once, by the person who filmed it.</p>
          </>
        ) : (
          <>
            <p className="label">Scored and listed</p>
            <p className="text-4xl font-medium tracking-tight">{result.quality_score}<span className="muted text-xl"> / 5</span></p>
            {result.ai ? (
              <>
                <p className="text-sm">Skill read: <span className="chip chip-slate">{result.ai.skill.level}</span> {result.ai.skill.evidence}</p>
                <ul className="text-sm muted list-disc pl-5">{result.ai.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {result.ai.flags.includes('faces') && <p className="text-sm text-amber-200">A face is visible. Buyers pay less for footage that needs blurring.</p>}
              </>
            ) : (
              <p className="text-sm muted">The vision review did not run ({result.aiError}). This score uses the technical checks and your labels only.</p>
            )}
            <p className="text-sm">Listed at ${result.price} at today&apos;s market rate. <Link className="underline underline-offset-4" href={`/buy/${result.id}`}>See the evidence trail</Link></p>
          </>
        )}
        <button className="btn btn-ghost" onClick={() => { setFile(null); setResult(null) }}>Upload another</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="card p-5 space-y-4">
        <div>
          <label className="label" htmlFor="video">Video</label>
          {/* accept=video/* opens the phone gallery or camera, no native app needed */}
          <input id="video" type="file" accept="video/*" className="input file:mr-3 file:rounded-full file:border-0 file:bg-paper file:px-3 file:py-1 file:text-ink" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <p className="mt-1 text-xs muted">{file.name}, {(file.size / 1e6).toFixed(1)} MB{episode ? ', with hand-pose episode' : ''}</p>}
        </div>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" maxLength={120} placeholder="Brake pad replacement, front axle" value={f.title} onChange={set('title')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {select('task', 'Task')}
          {select('industry', 'Industry')}
          {select('perspective', 'Perspective')}
          {select('device', 'Device')}
        </div>
        <div>
          {select('outcome', 'How did it go')}
          <p className="mt-1 text-xs muted">Mistakes and recoveries are wanted. Robots learn a lot from a dropped part or a second attempt.</p>
        </div>
        <div>
          <label className="label" htmlFor="tools">Tools used, comma separated</label>
          <input id="tools" className="input" placeholder="Torque wrench, caliper tool" value={f.tools} onChange={set('tools')} />
        </div>
        <div>
          <label className="label" htmlFor="description">What is being done</label>
          <textarea id="description" className="input" rows={2} maxLength={1000} value={f.description} onChange={set('description')} />
        </div>
        <div>
          <label className="label" htmlFor="steps">Steps, in your own trade words</label>
          <textarea id="steps" className="input" rows={3} maxLength={2000} placeholder={'1. Loosen caliper bolts\n2. Compress piston\n3. Seat new pads'} value={f.steps} onChange={set('steps')} />
        </div>
      </div>

      <div className="card p-5 space-y-4" aria-live="polite">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">Live quality</p>
            <p className="text-5xl font-medium tracking-tight">{file ? live : '-'}<span className="muted text-xl"> / 5</span></p>
          </div>
          <div className="text-right">
            <p className="label">Est. payout per sale</p>
            <p className="text-2xl">{file ? `$${est.toFixed(2)}` : '-'}</p>
          </div>
        </div>
        {mkt && !copy && <p className="text-xs muted">{f.task} trades at ${mkt.rate.toFixed(0)}/h right now ({mkt.signal.toLowerCase()}). Price follows demand after you list.</p>}
        {!file && <p className="text-sm muted">Pick a video. It is checked on your phone before anything uploads, so you can fix problems and reshoot.</p>}
        {stage && <p className="text-xs muted">{stage}</p>}
        <ul className="space-y-3">
          {cs.map((c) => (
            <li key={c.key}>
              <div className="flex justify-between text-sm"><span>{c.label}</span><span className="muted">{c.value}</span></div>
              <div className="bar mt-1"><i style={{ width: `${c.score * 100}%` }} /></div>
              {c.score < 0.7 && <p className="mt-1 text-xs text-amber-200">{c.tip}</p>}
            </li>
          ))}
          {file && (
            <li>
              <div className="flex justify-between text-sm"><span>Labels and steps</span><span className="muted">{Math.round(comp * 7)} of 7</span></div>
              <div className="bar mt-1"><i style={{ width: `${comp * 100}%` }} /></div>
              {comp < 1 && <p className="mt-1 text-xs muted">Each label you add raises the score and the payout.</p>}
            </li>
          )}
          {file && shots && (
            <li>
              <div className="flex justify-between text-sm"><span>Originality</span><span className="muted">{dup === null ? 'Checking' : copy ? (copy.kind === 'exact' ? 'Same file found' : 'Look-alike found') : 'No match'}</span></div>
              <div className="bar mt-1"><i style={{ width: dup === 'clear' ? '100%' : copy ? '8%' : '0%' }} /></div>
              {copy && <p role="alert" className="mt-1 text-xs text-amber-200">{copy.own ? 'You already uploaded this clip.' : 'This matches a clip someone already uploaded.'} It can be saved but will not be listed or paid.</p>}
            </li>
          )}
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>I filmed this myself, I have the right to license it, and anyone identifiable in it agreed. <span className="muted">You keep ownership and can withdraw it later.</span></span>
        </label>
        {error === 'signin' ? (
          <p className="text-sm">You need an account to upload. <Link className="underline" href="/login?mode=register">Create one</Link> or <Link className="underline" href="/login">sign in</Link>.</p>
        ) : error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button className="btn w-full" disabled={!file || !!busy}>{busy || 'Upload and score'}</button>
      </div>
    </form>
  )
}
