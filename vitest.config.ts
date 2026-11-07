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
        test: {
          name: 'docs',
          include: ['docs/src/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
