import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative paths so the build works on GitHub Pages under /orbit/.
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Loads registerSW.js as a file, not an inline script, so the CSP can stay strict.
      injectRegister: 'script',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Orbit',
        short_name: 'Orbit',
        description: 'Private cycle tracker. No ads, no tracking, your data stays on your device.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111310',
        theme_color: '#111310',
        categories: ['health', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole built app so it works offline from the first install.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
});
