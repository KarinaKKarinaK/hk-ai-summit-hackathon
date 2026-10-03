'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/record', name: 'Record', long: 'Record', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5a9 9 0 100 18 9 9 0 000-18z' },
  { href: '/sell', name: 'Sell', long: 'Sell', icon: 'M12 20V6m0 0l-6 6m6-6l6 6M4 3h16' },
  { href: '/buy', name: 'Buy', long: 'Marketplace', icon: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z' },
  { href: '/market', name: 'Prices', long: 'Prices', icon: 'M3 17l5-5 4 4 8-9M15 7h5v5' },
  { href: '/calls', name: 'Bounties', long: 'Bounties', icon: 'M4 6h16M4 12h16M4 18h10' },
]

/** Top links on desktop, bottom tab bar on phones. */
// The bar must render outside the header: the header's backdrop-blur would otherwise
// become the containing block for position:fixed and pin the bar to the top.
export default function Tabs({ bar = false }: { bar?: boolean }) {
  const path = usePathname()
  if (!bar) {
    return (
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path.startsWith(t.href) ? 'page' : undefined} className={path.startsWith(t.href) ? 'text-paper' : 'muted hover:text-paper'}>{t.long}</Link>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-tan/25 bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {tabs.map((t) => {
        const on = path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${on ? 'text-paper' : 'muted'}`}>
            {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-slate" aria-hidden />}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
            {t.name}
          </Link>
        )
      })}
    </nav>
  )
}
