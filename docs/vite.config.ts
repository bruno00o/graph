import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { fumadocsMdx } from 'fumadocs-mdx/vite'
import { defineConfig } from 'vite'

const library = resolve(import.meta.dirname, '../src')

export default defineConfig({
  server: { port: 5192, strictPort: true },
  preview: { port: 5192, strictPort: true },
  resolve: {
    alias: [
      { find: /^@bruno00o\/graph\/theme\.css/, replacement: resolve(library, 'theme/theme.css') },
      { find: '@bruno00o/graph/react', replacement: resolve(library, 'react/index.tsx') },
      { find: '@bruno00o/graph/db', replacement: resolve(library, 'db/index.ts') },
      { find: '@bruno00o/graph/query', replacement: resolve(library, 'query/index.ts') },
      { find: /^@bruno00o\/graph$/, replacement: resolve(library, 'index.ts') },
    ],
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/db',
      '@tanstack/query-core',
      '@tanstack/react-query',
      '@tanstack/react-store',
      '@tanstack/store',
    ],
  },
  build: { target: 'es2023' },
  plugins: [
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
      pages: [{ path: '/api/search' }],
    }),
    react(),
  ],
})
