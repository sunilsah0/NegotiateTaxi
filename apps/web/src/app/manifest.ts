import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Negotiate Taxi',
    short_name: 'Negotiate',
    start_url: '/',
    display: 'standalone',
    background_color: '#07070b',
    theme_color: '#facc15',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}