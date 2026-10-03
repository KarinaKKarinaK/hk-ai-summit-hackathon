'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/record', name: 'Record', long: 'Record', icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5a9 9 0 100 18 9 9 0 000-18z' },
  { href: '/sell', name: 'Sell', long: 'Sell', icon: 'M12 20V6m0 0l-6 6m6-6l6 6M4 3h16' },
  { href: '/buy', name: 'Buy', long: 'Marketplace', icon: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z' },
  { href: '/market', name: 'Prices', long: 'Prices', icon: 'M3 17l5-5 4 4 8-9M15 7h5v5' },
  { href: '/calls', name: 'Requests', long: 'Requests', icon: 'M4 6h16M4 12h16M4 18h10' },
]

/**
 * Top links on desktop, bottom tab bar on phones.
 * The bar must render outside the header: the header's backdrop-blur would otherwise
 * become the containing block for position:fixed and pin the bar to the top.
 */
export default function Tabs({ bar = false }: { bar?: boolean }) {
  const path = usePathname()
  if (!bar) {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
        {tabs.map((t) => {
          const on = path.startsWith(t.href)
          return <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`rounded-full px-3.5 py-1.5 transition-colors ${on ? 'bg-tan text-paper' : 'muted hover:text-paper'}`}>{t.long}</Link>
        })}
      </nav>
    )
  }
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 bg-ink pb-[env(safe-area-inset-bottom)] after:absolute after:inset-x-0 after:top-full after:h-60 after:bg-ink shadow-[0_-18px_30px_-6px_#080403] md:hidden">
      {tabs.map((t) => {
        const on = path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-end gap-1 pb-2 text-[11px] ${on ? 'font-semibold text-paper' : 'muted'}`}>
            {/* the selected tab lifts out of the bar on a warm disc, like a pressed seal */}
            <span className={`grid place-items-center rounded-full transition-all duration-300 ${on ? 'h-11 w-11 -translate-y-3 bg-linear-to-br from-amber to-rust text-paper shadow-[0_8px_18px_-6px_#6c4724,inset_0_1px_0_rgb(255_255_255/0.25)] ring-4 ring-ink' : 'h-7 w-7'}`}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
            </span>
            <span className={on ? '-mt-3' : ''}>{t.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
