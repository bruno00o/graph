import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer, loadConfigFromFile } from 'vite'
import { docsSite, root } from './harness.mjs'

const docs = join(root, 'docs')
const workerQuery = '?worker&inline'
const noWorker = '\0no-worker'

const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production' },
  join(docs, 'vite.config.ts'),
)
if (!loaded) throw new Error('docs/vite.config.ts not found')
const { config } = loaded
const origin = JSON.parse(config.define?.['import.meta.env.DOCS_ORIGIN'] ?? '""')

const server = await createServer({
  configFile: false,
  root: docs,
  base: config.base,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  define: config.define,
  resolve: config.resolve,
  plugins: [
    {
      name: 'without-workers',
      enforce: 'pre',
      resolveId: (source) => (source.endsWith(workerQuery) ? noWorker : null),
      load: (id) =>
        id === noWorker
          ? "export default function NoWorker() { throw new Error('og: no worker') }"
          : null,
    },
  ],
})

try {
  const { generate } = await server.ssrLoadModule(
    pathToFileURL(join(docs, 'og/generate.ts')).pathname,
  )
  const result = await generate(docsSite, `${origin}${config.base}`)
  const seconds = (result.milliseconds / 1000).toFixed(1)
  const kept = result.kept > 0 ? `, ${result.kept} kept` : ''
  console.log(
    `og: ${result.drawn} images drawn (${(result.bytes / 1e6).toFixed(1)} MB)${kept} in ${seconds} s`,
  )
} finally {
  await server.close()
}
