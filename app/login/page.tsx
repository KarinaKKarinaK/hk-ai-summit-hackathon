import Link from 'next/link'
import { redirect } from 'next/navigation'
import { login, register } from '../actions'
import { getUser } from '@/lib/server'

export default async function Login({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const { mode, error } = await searchParams
  const user = await getUser()
  if (user) redirect(user.role === 'seller' ? '/sell' : '/buy')
  const reg = mode === 'register'

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-4xl">{reg ? 'Create your account' : 'Welcome back'}</h1>
      <form action={reg ? register : login} className="card mt-6 grid gap-4 p-5">
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {reg && (
          <>
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="label">I want to</legend>
              {[['seller', 'Sell footage'], ['buyer', 'Buy data']].map(([v, l], i) => (
                <label key={v} className="input flex cursor-pointer items-center gap-2 has-[:checked]:border-slate">
                  <input type="radio" name="role" value={v} defaultChecked={i === 0} required /> {l}
                </label>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" className="input" required maxLength={80} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="org">Organisation, optional</label>
              <input id="org" name="org" className="input" maxLength={80} autoComplete="organization" />
            </div>
            <div className="seller-only gap-4">
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <div>
                  <label className="label" htmlFor="trade">Your trade</label>
                  <input id="trade" name="trade" className="input" maxLength={60} placeholder="Electrician" />
                </div>
                <div>
                  <label className="label" htmlFor="years">Years in it</label>
                  <input id="years" name="years" type="number" min={0} max={60} inputMode="numeric" className="input" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="credential">Licence or certificate, optional</label>
                <input id="credential" name="credential" className="input" maxLength={120} placeholder="Registered Electrical Worker Grade B" />
                <p className="muted mt-1 text-xs">Shown to buyers. 3+ years pays 1.25x, 10+ years pays 1.5x.</p>
              </div>
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" className="input" required minLength={reg ? 8 : undefined} autoComplete={reg ? 'new-password' : 'current-password'} />
        </div>
        <button className="btn">{reg ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="muted mt-4 text-sm">
        {reg ? 'Already registered? ' : 'New here? '}
        <Link className="text-paper underline underline-offset-4" href={reg ? '/login' : '/login?mode=register'}>{reg ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </main>
  )
}
