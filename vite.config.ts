import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const source = resolve(import.meta.dirname, 'src')

export default defineConfig({
  root: resolve(import.meta.dirname, 'examples'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@bruno00o/graph/theme.css', replacement: resolve(source, 'theme/theme.css') },
      { find: '@bruno00o/graph/react', replacement: resolve(source, 'react/index.tsx') },
      { find: '@bruno00o/graph/db', replacement: resolve(source, 'db/index.ts') },
      { find: '@bruno00o/graph/query', replacement: resolve(source, 'query/index.ts') },
      {
        find: '@bruno00o/graph/layouts/force',
        replacement: resolve(source, 'layouts/force/index.ts'),
      },
      { find: /^@bruno00o\/graph\/layouts$/, replacement: resolve(source, 'layouts/index.ts') },
      {
        find: /^@bruno00o\/graph\/devtools\/react$/,
        replacement: resolve(source, 'devtools/react.tsx'),
      },
      { find: /^@bruno00o\/graph\/devtools$/, replacement: resolve(source, 'devtools/index.ts') },
      { find: /^@bruno00o\/graph\/export$/, replacement: resolve(source, 'export/index.ts') },
      { find: /^@bruno00o\/graph\/map$/, replacement: resolve(source, 'map/index.ts') },
      { find: /^@bruno00o\/graph\/minimap$/, replacement: resolve(source, 'minimap/index.ts') },
      { find: /^@bruno00o\/graph\/legend$/, replacement: resolve(source, 'legend/index.ts') },
      { find: /^@bruno00o\/graph\/bundling$/, replacement: resolve(source, 'bundling/index.ts') },
      { find: /^@bruno00o\/graph\/timeline$/, replacement: resolve(source, 'timeline/index.ts') },
      { find: /^@bruno00o\/graph$/, replacement: resolve(source, 'index.ts') },
    ],
  },
  build: {
    target: 'es2023',
    outDir: resolve(import.meta.dirname, 'dist-examples'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'examples/index.html'),
        vanilla: resolve(import.meta.dirname, 'examples/vanilla/index.html'),
        react: resolve(import.meta.dirname, 'examples/react/index.html'),
        bench: resolve(import.meta.dirname, 'examples/bench/index.html'),
        collab: resolve(import.meta.dirname, 'examples/collab/index.html'),
        explore: resolve(import.meta.dirname, 'examples/explore/index.html'),
        edges: resolve(import.meta.dirname, 'examples/edges/index.html'),
        ends: resolve(import.meta.dirname, 'examples/ends/index.html'),
        groups: resolve(import.meta.dirname, 'examples/groups/index.html'),
        nodes: resolve(import.meta.dirname, 'examples/nodes/index.html'),
        labels: resolve(import.meta.dirname, 'examples/labels/index.html'),
        layout: resolve(import.meta.dirname, 'examples/layout/index.html'),
        layouts: resolve(import.meta.dirname, 'examples/layouts/index.html'),
        filter: resolve(import.meta.dirname, 'examples/filter/index.html'),
        drawing: resolve(import.meta.dirname, 'examples/drawing/index.html'),
        map: resolve(import.meta.dirname, 'examples/map/index.html'),
        bundling: resolve(import.meta.dirname, 'examples/bundling/index.html'),
        zoom: resolve(import.meta.dirname, 'examples/zoom/index.html'),
        time: resolve(import.meta.dirname, 'examples/time/index.html'),
        lens: resolve(import.meta.dirname, 'examples/lens/index.html'),
        multilayer: resolve(import.meta.dirname, 'examples/multilayer/index.html'),
      },
    },
  },
})
