'use client'

// Catches a crash on any page so the app shell and tab bar stay usable.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-3xl">This page hit a problem</h1>
      <p className="muted text-sm">Nothing was lost. Try again, or use the tabs to go somewhere else.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </main>
  )
}
