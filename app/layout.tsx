import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import Tabs from '@/components/Tabs'
import { getUser } from '@/lib/server'
import { logout } from './actions'

// Inter with the optical size axis: large text renders as Inter Display.
const inter = Inter({ subsets: ['latin'], axes: ['opsz'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Guild: skilled hands, robot-ready data',
  description: 'Tradespeople film their work, get a live quality score, and sell it as robot training data.',
  appleWebApp: { capable: true, title: 'Guild', statusBarStyle: 'black-translucent' },
  icons: { icon: '/pwa-icon/192', apple: '/pwa-icon/180' },
}

export const viewport: Viewport = { themeColor: '#080403', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <header className="sticky top-0 z-40 border-b border-tan/20 bg-ink/85 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-medium tracking-tight">Guild</Link>
            <Tabs />
            {user ? (
              <form action={logout} className="flex items-center gap-3 text-sm">
                <span className="muted hidden sm:inline">{user.name}</span>
                <button className="underline underline-offset-4">Sign out</button>
              </form>
            ) : (
              <Link href="/login" className="btn !min-h-9 text-sm">Sign in</Link>
            )}
          </div>
        </header>
        <div className="pb-24 md:pb-10">{children}</div>
        <Tabs bar />
      </body>
    </html>
  )
}
