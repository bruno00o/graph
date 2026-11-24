import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const workerQuery = '?worker&inline'
const noWorker = '\0no-worker'

function withoutWorkers(): Plugin {
  return {
    name: 'without-workers',
    enforce: 'pre',
    resolveId: (source) => (source.endsWith(workerQuery) ? noWorker : null),
    load: (id) =>
      id === noWorker
        ? "export default function NoWorker() { throw new Error('headless: no worker') }"
        : null,
  }
}

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx', 'src/**/*.headless.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        plugins: [withoutWorkers()],
        test: {
          name: 'headless',
          include: ['src/**/*.headless.test.ts'],
          environment: 'node',
          setupFiles: ['scripts/headless-setup.mjs'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
          environment: 'happy-dom',
        },
      },
      {
        extends: true,
        resolve: {
          alias: [
            {
              find: /^@bruno00o\/graph\/layouts\/force$/,
              replacement: resolve(import.meta.dirname, 'src/layouts/force/index.ts'),
            },
            {
              find: /^@bruno00o\/graph\/layouts\/chains$/,
              replacement: resolve(import.meta.dirname, 'src/layouts/chains/index.ts'),
            },
            {
              find: /^@bruno00o\/graph\/ways$/,
              replacement: resolve(import.meta.dirname, 'src/ways/index.ts'),
            },
            {
              find: /^@bruno00o\/graph\/layouts$/,
              replacement: resolve(import.meta.dirname, 'src/layouts/index.ts'),
            },
            {
              find: /^@bruno00o\/graph\/shapes$/,
              replacement: resolve(import.meta.dirname, 'src/shapes/index.ts'),
            },
            {
              find: /^@bruno00o\/graph$/,
              replacement: resolve(import.meta.dirname, 'src/index.ts'),
            },
          ],
        },
        test: {
          name: 'docs',
          include: ['docs/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
