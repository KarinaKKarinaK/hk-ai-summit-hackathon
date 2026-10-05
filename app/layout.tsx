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
  title: 'Guild: the open market for task data',
  description: 'People record how they do a task. It is checked and labelled, and companies license it as training data.',
  appleWebApp: { capable: true, title: 'Guild', statusBarStyle: 'black-translucent' },
  icons: { icon: '/pwa-icon/192', apple: '/pwa-icon/180' },
}

export const viewport: Viewport = { themeColor: '#080403', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <header className="sticky top-0 z-40 bg-ink pt-[env(safe-area-inset-top)] before:absolute before:inset-x-0 before:bottom-full before:h-60 before:bg-ink">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="text-lg font-medium tracking-tight">Guild</Link>
            <Tabs />
            {user ? (
              <form action={logout} className="flex items-center gap-3 text-sm">
                <Link href="/profile" className="muted max-w-28 truncate underline-offset-4 hover:underline">{user.name}</Link>
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
