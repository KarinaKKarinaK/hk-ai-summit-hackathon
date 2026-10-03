import type { MetadataRoute } from 'next'

// This is what makes "Add to Home Screen" open the site full screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Guild',
    short_name: 'Guild',
    description: 'Film your trade. Sell it as robot training data.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#080403',
    theme_color: '#080403',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
