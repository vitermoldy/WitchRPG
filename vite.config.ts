import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// On Windows the folder can be opened as c:\... or C:\...; Vite then loads some modules once per
// spelling. Pin the root to one spelling.
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/^[a-z]:/, (d) => d.toUpperCase())
// The MySQL server (npm run server) keeps accounts, the witch and the Rift history; dev and
// preview forward /api to it.

export default defineConfig({
  root,
  // Relative asset paths, so the built game runs from any folder or static host.
  base: './',
  server: { port: 5197 },
  preview: { port: 4197 },
  // three.js alone is ~600 kB minified; the whole game is one bundle on purpose.
  build: { chunkSizeWarningLimit: 900 },
  resolve: {
    alias: { '@': root + 'src' },
    dedupe: ['three'],
  },
})
