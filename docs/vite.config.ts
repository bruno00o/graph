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
      {
        find: '@bruno00o/graph/layouts/force',
        replacement: resolve(library, 'layouts/force/index.ts'),
      },
      { find: /^@bruno00o\/graph\/layouts$/, replacement: resolve(library, 'layouts/index.ts') },
      {
        find: /^@bruno00o\/graph\/devtools\/react$/,
        replacement: resolve(library, 'devtools/react.tsx'),
      },
      { find: /^@bruno00o\/graph\/devtools$/, replacement: resolve(library, 'devtools/index.ts') },
      { find: /^@bruno00o\/graph\/export$/, replacement: resolve(library, 'export/index.ts') },
      { find: /^@bruno00o\/graph\/map$/, replacement: resolve(library, 'map/index.ts') },
      { find: /^@bruno00o\/graph\/minimap$/, replacement: resolve(library, 'minimap/index.ts') },
      { find: /^@bruno00o\/graph\/legend$/, replacement: resolve(library, 'legend/index.ts') },
      { find: /^@bruno00o\/graph\/bundling$/, replacement: resolve(library, 'bundling/index.ts') },
      { find: /^@bruno00o\/graph\/timeline$/, replacement: resolve(library, 'timeline/index.ts') },
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
