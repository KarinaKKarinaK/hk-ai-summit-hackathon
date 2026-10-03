'use client'

import { useState } from 'react'
import Link from 'next/link'
import Glyph from './Glyph'
import UploadForm from './UploadForm'

/** The two ways to add data: record live in the app, or pick an existing video. Picking one starts processing right here. */
export default function SellStart({ years = 0 }: { years?: number }) {
  const [file, setFile] = useState<File | null>(null)
  if (file) {
    return (
      <section className="space-y-3">
        <button className="muted text-sm underline underline-offset-4" onClick={() => setFile(null)}>Choose a different video</button>
        <UploadForm key={file.name + file.size} initialFile={file} years={years} />
      </section>
    )
  }
  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Link href="/record" className="card card-warm block overflow-hidden">
        <Glyph name="record" className="h-28 w-full md:h-48" />
        <div className="p-5 pt-3">
          <h2 className="text-2xl font-semibold">Record live</h2>
          <p className="mt-1 text-sm text-paper/80">Film in the app with hand tracking and a quick live challenge. Verified clips earn more and can fill paid requests.</p>
        </div>
      </Link>
      <label className="card block cursor-pointer overflow-hidden has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-slate">
        <Glyph name="upload" className="h-28 w-full md:h-48" />
        <div className="p-5 pt-3">
          <h2 className="text-2xl font-semibold">Upload from gallery</h2>
          <p className="muted mt-1 text-sm">Pick a video you already have. It is analysed on your phone first, then listed as not verified live.</p>
        </div>
        {/* accept=video/* opens the phone gallery */}
        <input type="file" accept="video/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
    </section>
  )
}
