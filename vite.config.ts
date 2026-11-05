import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const source = resolve(import.meta.dirname, 'src')

export default defineConfig({
  root: resolve(import.meta.dirname, 'examples'),
  resolve: {
    alias: [
      { find: '@bruno00o/graph/theme.css', replacement: resolve(source, 'theme/theme.css') },
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
      },
    },
  },
})
