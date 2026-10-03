'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upload } from '@vercel/blob/client'
import { analyze } from '@/lib/quality'
import { LABELS, BASE_RATE, HOLD_DAYS, checks, technical, completeness, finalScore, listPrice, payout, type Labels, type Metrics } from '@/lib/score'

type Dup = { kind: string; own: boolean }
type Result = {
  id: string; quality_score: number; price: number; aiError: string | null; duplicate?: Dup | null; unverified?: string
  bounty?: { paid: number; title?: string; reason?: string } | null
  ai: null | { reasons: string[]; flags: string[]; skill: { level: string; evidence: string } }
}

/** Submits a take recorded on /record. There is no file picker: gallery uploads are not accepted. */
export default function UploadForm({ initialFile: file, episode, requestId, years = 0 }: { initialFile: File; episode: object; requestId?: string; years?: number }) {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics>({})
  const [stage, setStage] = useState('')
  const [shots, setShots] = useState<Awaited<ReturnType<typeof analyze>> | null>(null)
  const [dup, setDup] = useState<Dup | 'clear' | null>(null) // null = not checked yet
  const [f, setF] = useState({ title: '', description: '', steps: '', perspective: '', task: '', industry: '', device: '', outcome: '', tools: '' })
  const [consent, setConsent] = useState(false)
  const [workplace, setWorkplace] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let live = true
    setStage('Reading video')
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
  const copy = dup && dup !== 'clear' ? dup : null
  const est = copy ? 0 : payout(listPrice(BASE_RATE, minutes, live, years))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (!(await fetch('/api/upload')).ok) return setError('signin')
      const opts = { access: 'public' as const, handleUploadUrl: '/api/blob' }
      setBusy('Uploading 0%')
      const video = await upload(file.name, file, { ...opts, onUploadProgress: (p) => setBusy(`Uploading ${Math.round(p.percentage)}%`) })
      // the consent record travels inside the episode file, next to the motion and challenge data
      const signed = { ...episode, consent: { owns_footage: true, workplace_permission: true, license: 'non-exclusive', timestamp: new Date().toISOString() } }
      const ep = await upload(file.name.replace(/\.\w+$/, '') + '.episode.json', new Blob([JSON.stringify(signed)], { type: 'application/json' }), opts)
      setBusy('Verifying and scoring')
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: video.url, episode_url: ep.url, request_id: requestId, consent: consent && workplace, title: f.title, description: f.description, steps: f.steps, labels, metrics, frames: shots?.frames ?? [], thumb: shots?.thumb, hashes: shots?.hashes, fingerprint: shots?.fingerprint }),
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
      <div className="card space-y-3 p-5">
        {result.duplicate ? (
          <>
            <p className="label">Not listed</p>
            <p className="text-sm">{result.duplicate.own ? 'You already submitted this clip.' : 'This matches a clip that someone already submitted.'} A clip can only be sold once, by the person who filmed it.</p>
          </>
        ) : result.unverified ? (
          <>
            <p className="label">Not listed</p>
            <p className="text-sm">We could not verify this was filmed live. {result.unverified}. Record again and complete the challenge.</p>
          </>
        ) : (
          <>
            <p className="label">Verified, scored and listed</p>
            <p className="text-4xl font-medium tracking-tight">{result.quality_score}<span className="muted text-xl"> / 5</span></p>
            {result.bounty?.paid ? (
              <p className="text-sm"><span className="chip chip-slate">Request accepted</span> ${result.bounty.paid} guaranteed for &ldquo;{result.bounty.title}&rdquo;. Released after the {HOLD_DAYS}-day hold.</p>
            ) : result.bounty ? (
              <p className="text-sm text-amber-200">Not accepted for the request: {result.bounty.reason}. The clip is still listed in the open catalog.</p>
            ) : null}
            {result.ai ? (
              <>
                <p className="text-sm">Skill read: <span className="chip chip-slate">{result.ai.skill.level}</span> {result.ai.skill.evidence}</p>
                <ul className="muted list-disc pl-5 text-sm">{result.ai.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {result.ai.flags.includes('faces') && <p className="text-sm text-amber-200">A face is visible. Buyers pay less for footage that needs blurring.</p>}
              </>
            ) : (
              <p className="muted text-sm">The vision review did not run ({result.aiError}). This score uses the technical checks and your labels only.</p>
            )}
            <p className="text-sm">In the catalog at ${result.price}, earning you a share every time it sells. <Link className="underline underline-offset-4" href={`/buy/${result.id}`}>See the evidence trail</Link></p>
          </>
        )}
        <a href="/record" className="btn btn-ghost">Record another</a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-4 p-5">
        <p className="muted text-xs">{file.name}, {(file.size / 1e6).toFixed(1)} MB, recorded in the app with hand-pose, motion and challenge data</p>
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
          <p className="muted mt-1 text-xs">Mistakes and recoveries are wanted. Robots learn a lot from a dropped part or a second attempt.</p>
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
          <label className="label" htmlFor="steps">Steps, in your own words</label>
          <textarea id="steps" className="input" rows={3} maxLength={2000} placeholder={'1. Loosen caliper bolts\n2. Compress piston\n3. Seat new pads'} value={f.steps} onChange={set('steps')} />
        </div>
      </div>

      <div className="card space-y-4 p-5" aria-live="polite">
        <div className="flex items-end justify-between">
          <div>
            <p className="label">Quality</p>
            <p className="text-5xl font-medium tracking-tight">{live}<span className="muted text-xl"> / 5</span></p>
          </div>
          <div className="text-right">
            <p className="label">{requestId ? 'Catalog share per sale' : 'Est. payout per sale'}</p>
            <p className="text-2xl">${est.toFixed(2)}</p>
          </div>
        </div>
        {requestId && <p className="muted text-xs">Recorded for a request: if it passes, the request pays you its guaranteed rate on top of any catalog sales.</p>}
        {stage && <p className="muted text-xs">{stage}</p>}
        <ul className="space-y-3">
          <li>
            <div className="flex justify-between text-sm"><span>Filmed live</span><span className="muted">Challenge passed</span></div>
            <div className="bar mt-1"><i style={{ width: '100%' }} /></div>
          </li>
          {cs.map((c) => (
            <li key={c.key}>
              <div className="flex justify-between text-sm"><span>{c.label}</span><span className="muted">{c.value}</span></div>
              <div className="bar mt-1"><i style={{ width: `${c.score * 100}%` }} /></div>
              {c.score < 0.7 && <p className="mt-1 text-xs text-amber-200">{c.tip}</p>}
            </li>
          ))}
          <li>
            <div className="flex justify-between text-sm"><span>Labels and steps</span><span className="muted">{Math.round(comp * 7)} of 7</span></div>
            <div className="bar mt-1"><i style={{ width: `${comp * 100}%` }} /></div>
            {comp < 1 && <p className="muted mt-1 text-xs">Each label you add raises the score and the payout.</p>}
          </li>
          {shots && (
            <li>
              <div className="flex justify-between text-sm"><span>Originality</span><span className="muted">{dup === null ? 'Checking' : copy ? (copy.kind === 'exact' ? 'Same file found' : 'Look-alike found') : 'No match'}</span></div>
              <div className="bar mt-1"><i style={{ width: dup === 'clear' ? '100%' : copy ? '8%' : '0%' }} /></div>
              {copy && <p role="alert" className="mt-1 text-xs text-amber-200">{copy.own ? 'You already submitted this clip.' : 'This matches a clip someone already submitted.'} It can be saved but will not be listed or paid.</p>}
            </li>
          )}
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span>I filmed this myself, I grant a non-exclusive training licence, and anyone identifiable in it agreed. <span className="muted">You keep ownership and can withdraw it later.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={workplace} onChange={(e) => setWorkplace(e.target.checked)} required />
          <span>If this was filmed at a workplace, I have permission to record there.</span>
        </label>
        {error === 'signin' ? (
          <p className="text-sm">You need an account to submit. <Link className="underline" href="/login?mode=register">Create one</Link> or <Link className="underline" href="/login">sign in</Link>, then record again.</p>
        ) : error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button className="btn w-full" disabled={!!busy}>{busy || 'Submit for verification'}</button>
        <p className="muted text-xs">Payouts are released after a {HOLD_DAYS}-day hold, so fraud found later is never paid.</p>
      </div>
    </form>
  )
}
