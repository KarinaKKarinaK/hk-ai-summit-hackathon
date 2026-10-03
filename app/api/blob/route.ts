import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { getUser } from '@/lib/server'

// Hands the browser a short-lived token so video goes straight to Blob storage
// (serverless request bodies cap at 4.5MB, videos do not fit).
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        if (!(await getUser())) throw new Error('Sign in to upload')
        return { allowedContentTypes: ['video/*', 'application/json'], maximumSizeInBytes: 500 * 1024 * 1024, addRandomSuffix: true }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
