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
      },
    },
  },
})
