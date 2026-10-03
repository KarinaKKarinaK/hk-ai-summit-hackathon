import { NextResponse } from 'next/server'
import { getUser, findDuplicate, cleanHashes } from '@/lib/server'

// Live originality check, run while the seller is still filling in the form.
// Says only whether a match exists and whether it is the caller's own clip, never whose it is.
export async function POST(request: Request) {
  const b = await request.json().catch(() => null)
  const { fingerprint, hashes } = cleanHashes(b)
  const dup = await findDuplicate(fingerprint, hashes, (await getUser())?.id)
  return NextResponse.json({ duplicate: dup && { kind: dup.kind, own: dup.own } })
}
