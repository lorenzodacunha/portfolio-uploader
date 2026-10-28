import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The interface and the API run on one server (server/index.js, which mounts Vite in development), so there is no
// proxy. A build on Vercel (VERCEL=1) or with DEMO=1 is the public demonstration: no API, fictitious projects kept in
// the visitor's browser (src/lib/demo).
const demo = process.env.DEMO === '1' || process.env.VERCEL === '1'

export default defineConfig({
  plugins: [react()],
  define: {
    __DEMO__: JSON.stringify(demo),
  },
  build: {
    rollupOptions: {
      output: {
        // React and the text editor change less often than the app: separate files the browser keeps cached.
        manualChunks(id) {
          if (/node_modules[\\/](@tiptap|prosemirror-|orderedmap|rope-sequence|w3c-keyname|linkifyjs)/.test(id)) return 'editor'
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
        },
      },
    },
  },
})
