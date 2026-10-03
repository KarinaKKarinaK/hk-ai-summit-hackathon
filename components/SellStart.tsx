'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Glyph from './Glyph'
import UploadForm from './UploadForm'

/**
 * The three ways to add data: film your hands in the app, record your screen, or pick an existing video.
 * The last two start processing right here.
 */
export default function SellStart({ years = 0 }: { years?: number }) {
  const [pick, setPick] = useState<{ file: File; kind?: 'screen' } | null>(null)
  const [canScreen, setCanScreen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const rec = useRef<MediaRecorder | null>(null)

  // screen capture exists on desktop browsers only. Checked after mount so server and client render the same.
  useEffect(() => setCanScreen(!!navigator.mediaDevices?.getDisplayMedia), [])

  async function screen() {
    if (rec.current) return rec.current.stop()
    setError('')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
      const mimeType = ['video/mp4', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        rec.current = null
        setRecording(false)
        const type = mr.mimeType.split(';')[0] || 'video/webm'
        setPick({ file: new File(chunks, `screen-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type }), kind: 'screen' })
      }
      // the browser's own "Stop sharing" button ends the recording too
      stream.getVideoTracks()[0].onended = () => mr.state !== 'inactive' && mr.stop()
      mr.start()
      rec.current = mr
      setRecording(true)
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Screen sharing was cancelled.' : `Could not record the screen: ${(e as Error).message}`)
    }
  }

  if (pick) {
    return (
      <section className="space-y-3">
        <button className="muted text-sm underline underline-offset-4" onClick={() => setPick(null)}>Start over</button>
        <UploadForm key={pick.file.name + pick.file.size} initialFile={pick.file} kind={pick.kind} years={years} />
      </section>
    )
  }
  const card = 'card block overflow-hidden text-left'
  return (
    <section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link href="/record" className={`${card} card-warm`}>
          <Glyph name="record" className="h-24 w-full md:h-40" />
          <div className="p-5 pt-3">
            <h2 className="text-xl font-semibold md:text-2xl">Film your hands</h2>
            <p className="mt-1 text-sm text-paper/80">Physical tasks, tracked live and verified. Can fill paid requests.</p>
          </div>
        </Link>
        <button onClick={screen} disabled={!canScreen} className={`${card} ${recording ? '!bg-red-900/60' : ''} disabled:opacity-50`}>
          <Glyph name="box" className="h-24 w-full md:h-40" />
          <div className="p-5 pt-3">
            <h2 className="text-xl font-semibold md:text-2xl">{recording ? 'Recording. Click to stop' : 'Record your screen'}</h2>
            <p className="muted mt-1 text-sm">{canScreen ? 'Software tasks: a spreadsheet, a form, a workflow. Do the task, then stop.' : 'Software tasks. Available in a desktop browser.'}</p>
          </div>
        </button>
        <label className={`${card} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate`}>
          <Glyph name="upload" className="h-24 w-full md:h-40" />
          <div className="p-5 pt-3">
            <h2 className="text-xl font-semibold md:text-2xl">Upload a video</h2>
            <p className="muted mt-1 text-sm">One you already have. Listed as not verified live.</p>
          </div>
          {/* accept=video/* opens the phone gallery */}
          <input type="file" accept="video/*" className="sr-only" onChange={(e) => e.target.files?.[0] && setPick({ file: e.target.files[0] })} />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </section>
  )
}
