'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Four places: record a task, earn from it, buy data, see your numbers.
// Requests are reached from Earn (to fill them) and Marketplace (to post them). Prices sit under Marketplace.
const tabs = [
  { href: '/record', name: 'Add data', under: ['/record'], icon: 'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5a9 9 0 100 18 9 9 0 000-18z' },
  { href: '/sell', name: 'Earn', under: ['/sell', '/calls'], icon: 'M12 20V6m0 0l-6 6m6-6l6 6M4 3h16' },
  { href: '/buy', name: 'Buy data', under: ['/buy', '/market'], icon: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z' },
  { href: '/profile', name: 'Profile', under: ['/profile', '/login'], icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0' },
]

/**
 * Top links on desktop, bottom tab bar on phones.
 * The bar must render outside the header: a blurred or transformed header would otherwise
 * become the containing block for position:fixed and pin the bar to the top.
 */
export default function Tabs({ bar = false }: { bar?: boolean }) {
  const path = usePathname()
  const on = (t: (typeof tabs)[number]) => t.under.some((p) => path.startsWith(p))
  if (!bar) {
    return (
      <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={on(t) ? 'page' : undefined} className={`relative px-4 py-1.5 transition-colors after:absolute after:inset-x-4 after:-bottom-0.5 after:h-0.5 after:origin-left after:rounded-full after:bg-flame after:transition-transform after:duration-300 ${on(t) ? 'text-paper after:scale-x-100' : 'muted after:scale-x-0 hover:text-paper'}`}>{t.name}</Link>
        ))}
      </nav>
    )
  }
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 bg-ink pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_30px_-6px_#080403] after:absolute after:inset-x-0 after:top-full after:h-60 after:bg-ink md:hidden">
      {tabs.map((t) => {
        const active = on(t)
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={`relative flex h-16 flex-col items-center justify-end gap-1 pb-2 text-[11px] before:absolute before:top-0 before:h-0.5 before:w-9 before:rounded-full before:bg-flame before:transition-opacity before:duration-300 ${active ? 'font-medium text-paper before:opacity-100' : 'muted before:opacity-0'}`}>
            <span className={`grid h-7 w-7 place-items-center transition-colors duration-300 ${active ? 'text-flame' : ''}`}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
            </span>
            <span>{t.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
