import type { MetadataRoute } from 'next'

/**
 * Web manifest: the game can be added to the home screen of a phone, and then opens full
 * screen, in portrait, like an installed game.
 *
 * @returns The manifest of the application.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Royaumes',
    short_name: 'Royaumes',
    description: 'Bâtissez un village, armez une flotte et gouvernez les mers.',
    start_url: '/village',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#25708f',
    theme_color: '#2a170a',
    lang: 'fr',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
