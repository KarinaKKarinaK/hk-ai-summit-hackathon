import Link from 'next/link'
import { sql, getUser } from '@/lib/server'
import { LABELS } from '@/lib/score'
import { postCall } from '../actions'

export default async function Calls({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const user = await getUser()
  const rows = await sql`select c.*, coalesce(b.org, b.name) as buyer from calls c join users b on b.id = c.buyer_id order by c.created_at desc`

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl md:text-5xl">Open calls</h1>
          <p className="muted mt-2 text-sm">What buyers will pay for right now. Film to match a call and it sells faster.</p>
        </div>
        <ul className="grid gap-3">
          {rows.map((c) => (
            <li key={c.id} className="card space-y-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-medium leading-snug tracking-normal">{c.title}</h2>
                <span className="whitespace-nowrap text-xl font-light">${c.rate}<span className="muted text-sm">/h</span></span>
              </div>
              <p className="muted text-sm">{c.description}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs">
                {[c.task, c.industry].filter(Boolean).map((x: string) => <span key={x} className="chip">{x}</span>)}
                <span className="chip chip-slate">{Math.round(c.hours)} hours wanted</span>
                <span className="muted">by {c.buyer}</span>
              </p>
              <Link href="/sell" className="inline-block text-sm underline underline-offset-4">Upload footage for this</Link>
            </li>
          ))}
        </ul>
      </div>

      <aside className="md:sticky md:top-20 md:self-start">
        <form action={postCall} className="card grid gap-4 p-5">
          <h2 className="text-xl">Post a call</h2>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div>
            <label className="label" htmlFor="title">What you need</label>
            <input id="title" name="title" className="input" required maxLength={120} placeholder="500 hours of egocentric panel wiring" />
          </div>
          <div>
            <label className="label" htmlFor="description">Requirements</label>
            <textarea id="description" name="description" className="input" rows={3} maxLength={1000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select name="task" aria-label="Task" className="input"><option value="">Task: any</option>{LABELS.task.map((o) => <option key={o}>{o}</option>)}</select>
            <select name="industry" aria-label="Industry" className="input"><option value="">Industry: any</option>{LABELS.industry.map((o) => <option key={o}>{o}</option>)}</select>
            <div>
              <label className="label" htmlFor="hours">Hours wanted</label>
              <input id="hours" name="hours" type="number" min={1} inputMode="numeric" className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="rate">USD per hour</label>
              <input id="rate" name="rate" type="number" min={1} inputMode="numeric" className="input" required />
            </div>
          </div>
          {user ? <button className="btn">Post call</button> : <Link href="/login" className="btn">Sign in to post</Link>}
        </form>
      </aside>
    </main>
  )
}
