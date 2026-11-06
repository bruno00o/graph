import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type Plugin, rolldown } from 'rolldown'
import { defineConfig } from 'tsdown'

const workerQuery = '?worker&inline'
const workerPrefix = '\0inline-worker:'

function inlineWorker(): Plugin {
  return {
    name: 'inline-worker',
    resolveId(source, importer) {
      if (!source.endsWith(workerQuery) || !importer) return null
      const path = resolve(dirname(importer), source.slice(0, -workerQuery.length))
      return workerPrefix + (existsSync(path) ? path : `${path}.ts`)
    },
    async load(id) {
      if (!id.startsWith(workerPrefix)) return null
      const bundle = await rolldown({ input: id.slice(workerPrefix.length), platform: 'browser' })
      const { output } = await bundle.generate({ format: 'iife', minify: true })
      await bundle.close()
      const code = output[0].code
      return [
        `const source = ${JSON.stringify(code)}`,
        'export default function InlineWorker(options) {',
        "  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))",
        '  try {',
        '    return new Worker(url, options)',
        '  } finally {',
        '    URL.revokeObjectURL(url)',
        '  }',
        '}',
      ].join('\n')
    },
  }
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react/index.tsx',
    db: 'src/db/index.ts',
    query: 'src/query/index.ts',
    layouts: 'src/layouts/index.ts',
    'layouts/force': 'src/layouts/force/index.ts',
    devtools: 'src/devtools/index.ts',
    'devtools/react': 'src/devtools/react.tsx',
  },
  format: 'esm',
  platform: 'neutral',
  target: 'es2023',
  dts: true,
  sourcemap: true,
  clean: true,
  plugins: [inlineWorker()],
  copy: [{ from: 'src/theme/theme.css', to: 'dist', flatten: true }],
})
