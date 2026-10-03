import { ImageResponse } from 'next/og'

// App icon drawn in code, so there are no PNG files to keep in sync.
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Math.min(1024, Math.max(32, parseInt((await params).size) || 192))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #080403 35%, #311604 70%, #6c4724)', color: '#f1ece6', fontSize: size * 0.56, fontWeight: 600, letterSpacing: '-0.05em' }}>
        G
      </div>
    ),
    { width: size, height: size },
  )
}
