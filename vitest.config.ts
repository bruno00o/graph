import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.dom.test.ts', 'src/**/*.dom.test.tsx'],
          environment: 'node',
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
              find: /^@bruno00o\/graph\/layouts$/,
              replacement: resolve(import.meta.dirname, 'src/layouts/index.ts'),
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
