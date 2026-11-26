import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { redact } from '@tanstack/redact/vite'
import react from '@vitejs/plugin-react'
import { fumadocsMdx } from 'fumadocs-mdx/vite'
import { defineConfig, type Plugin } from 'vite'
import { imagetools } from 'vite-imagetools'
import { graphAgent } from '../src/agent/vite.ts'

const library = resolve(import.meta.dirname, '../src')
const { DOCS_BASE: requestedBase = '/' } = process.env
const base = `/${requestedBase.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
const { DOCS_ORIGIN: requestedOrigin = 'https://bruno00o.github.io' } = process.env
const { REDACT: underRedact } = process.env
const origin = requestedOrigin.replace(/\/+$/, '')
const content = resolve(import.meta.dirname, 'content/docs')

function markdownPages(directory = content, parents: string[] = []): { path: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      const group = /^\(.*\)$/.test(entry.name)
      return markdownPages(join(directory, entry.name), group ? parents : [...parents, entry.name])
    }
    if (!entry.name.endsWith('.mdx')) return []
    const name = entry.name.slice(0, -'.mdx'.length)
    const slugs = name === 'index' ? parents : [...parents, name]
    return [{ path: slugs.length === 0 ? '/docs/index.md' : `/docs/${slugs.join('/')}.md` }]
  })
}

function previewThumbnails(): Plugin {
  const folders = ['examples'] as const
  return {
    name: 'preview-thumbnails',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    async generateBundle() {
      const { default: sharp } = await import('sharp')
      const files = folders.flatMap((folder) => {
        const directory = resolve(import.meta.dirname, 'src', folder)
        return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const file = join(directory, entry.name, 'thumbnail.webp')
          return entry.isDirectory() && existsSync(file)
            ? [{ file, name: `og/${folder}/${entry.name}.png` }]
            : []
        })
      })
      const images = await Promise.all(
        files.map(({ file }) =>
          sharp(readFileSync(file)).png({ compressionLevel: 9, palette: true }).toBuffer(),
        ),
      )
      files.forEach(({ name }, index) => {
        this.emitFile({ type: 'asset', fileName: name, source: images[index] as Buffer })
      })
    },
  }
}

export default defineConfig({
  base,
  define: { 'import.meta.env.DOCS_ORIGIN': JSON.stringify(origin) },
  server: { port: 5192, strictPort: true },
  preview: { port: 5192, strictPort: true },
  resolve: {
    alias: [
      { find: /^@bruno00o\/graph\/theme\.css/, replacement: resolve(library, 'theme/theme.css') },
      { find: '@bruno00o/graph/react', replacement: resolve(library, 'react/index.tsx') },
      { find: '@bruno00o/graph/db', replacement: resolve(library, 'db/index.ts') },
      { find: '@bruno00o/graph/query', replacement: resolve(library, 'query/index.ts') },
      { find: /^@bruno00o\/graph\/cypher$/, replacement: resolve(library, 'cypher/index.ts') },
      { find: /^@bruno00o\/graph\/formats$/, replacement: resolve(library, 'formats/index.ts') },
      {
        find: '@bruno00o/graph/layouts/force',
        replacement: resolve(library, 'layouts/force/index.ts'),
      },
      {
        find: /^@bruno00o\/graph\/layouts\/chains$/,
        replacement: resolve(library, 'layouts/chains/index.ts'),
      },
      { find: /^@bruno00o\/graph\/ways$/, replacement: resolve(library, 'ways/index.ts') },
      { find: /^@bruno00o\/graph\/layouts$/, replacement: resolve(library, 'layouts/index.ts') },
      {
        find: /^@bruno00o\/graph\/devtools\/react$/,
        replacement: resolve(library, 'devtools/react.tsx'),
      },
      { find: /^@bruno00o\/graph\/devtools$/, replacement: resolve(library, 'devtools/index.ts') },
      { find: /^@bruno00o\/graph\/export$/, replacement: resolve(library, 'export/index.ts') },
      {
        find: /^@bruno00o\/graph\/map\/react$/,
        replacement: resolve(library, 'map/react.tsx'),
      },
      { find: /^@bruno00o\/graph\/map$/, replacement: resolve(library, 'map/index.ts') },
      {
        find: /^@bruno00o\/graph\/editor\/react$/,
        replacement: resolve(library, 'editor/react.tsx'),
      },
      { find: /^@bruno00o\/graph\/editor$/, replacement: resolve(library, 'editor/index.ts') },
      { find: /^@bruno00o\/graph\/minimap$/, replacement: resolve(library, 'minimap/index.ts') },
      { find: /^@bruno00o\/graph\/legend$/, replacement: resolve(library, 'legend/index.ts') },
      { find: /^@bruno00o\/graph\/bundling$/, replacement: resolve(library, 'bundling/index.ts') },
      { find: /^@bruno00o\/graph\/routing$/, replacement: resolve(library, 'routing/index.ts') },
      { find: /^@bruno00o\/graph\/shapes$/, replacement: resolve(library, 'shapes/index.ts') },
      { find: /^@bruno00o\/graph\/timeline$/, replacement: resolve(library, 'timeline/index.ts') },
      { find: /^@bruno00o\/graph\/history$/, replacement: resolve(library, 'history/index.ts') },
      { find: /^@bruno00o\/graph\/headless$/, replacement: resolve(library, 'headless/index.ts') },
      { find: /^@bruno00o\/graph\/agent\/dev$/, replacement: resolve(library, 'agent/dev.ts') },
      { find: /^@bruno00o\/graph\/agent$/, replacement: resolve(library, 'agent/index.ts') },
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
    previewThumbnails(),
    tailwindcss(),
    imagetools(),
    tanstackStart({
      prerender: { enabled: true, crawlLinks: true, failOnError: true },
      pages: [
        { path: '/api/search' },
        { path: '/llms.txt' },
        { path: '/llms-full.txt' },
        { path: '/ard.json' },
        { path: '/sitemap.xml' },
        ...markdownPages(),
        { path: '/not-found', prerender: { outputPath: '/404.html', autoSubfolderIndex: false } },
      ],
    }),
    react(),
    graphAgent(),
    ...(underRedact ? [redact()] : []),
  ],
  ...(underRedact ? { ssr: { noExternal: true } } : {}),
})
