import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importsOf, isRelative, moduleOf } from '../examples/imports'
import { type CatalogInput, catalog, createCatalog, thumbnailFiles } from './catalog'
import type { ShowcaseMeta, ShowcaseModule } from './types'

const folder = fileURLToPath(new URL('.', import.meta.url))
const docs = join(folder, '../../content/docs')
const library = JSON.parse(readFileSync(join(folder, '../../../package.json'), 'utf8')) as {
  readonly exports: Readonly<Record<string, unknown>>
}
const publicModules = new Set(
  Object.keys(library.exports).map((path) => `@bruno00o/graph${path.slice(1)}`),
)

function pageExists(directory: string, page: string): boolean {
  const path = join(directory, page.split('#')[0] ?? '')
  return existsSync(`${path}.mdx`) || existsSync(join(path, 'index.mdx'))
}

function codeFiles(slug: string): string[] {
  return readdirSync(join(folder, slug)).filter(
    (file) => /\.(ts|tsx)$/.test(file) && file !== 'meta.ts' && !file.endsWith('.test.ts'),
  )
}

const meta: ShowcaseMeta = {
  title: 'Sample',
  description: 'A sample.',
  domain: 'Sample',
  order: 10,
  tags: ['React'],
  features: [{ text: 'A feature.', page: 'map#globe' }],
  api: ['define-graph'],
  source: {
    name: 'Source',
    url: 'https://example.org',
    license: 'License',
    licenseUrl: 'https://example.org/license',
    build: 'pnpm build',
  },
}

const load = (): Promise<ShowcaseModule> => Promise.resolve({})

function sample(overrides: Partial<CatalogInput> = {}): CatalogInput {
  return {
    metas: { './sample/meta.ts': meta },
    entries: { './sample/main.tsx': load },
    images: {
      [`./sample/${thumbnailFiles.light}`]: '/light.webp',
      [`./sample/${thumbnailFiles.dark}`]: '/dark.webp',
    },
    ...overrides,
  }
}

describe('showcase catalog', () => {
  it('reads every app folder without a problem', () => {
    expect(catalog.problems).toEqual([])
    expect(catalog.showcases.length).toBeGreaterThan(0)
  })

  it('has a light and a dark thumbnail for every app', () => {
    expect(catalog.missingThumbnails).toEqual([])
  })

  it('links only to docs pages that exist', () => {
    const missing = catalog.showcases.flatMap((showcase) => [
      ...showcase.api
        .filter((page) => !pageExists(join(docs, 'api'), page))
        .map((page) => `${showcase.slug}: no page /docs/api/${page}`),
      ...showcase.features
        .filter((feature) => !pageExists(join(docs, '(guide)'), feature.page))
        .map((feature) => `${showcase.slug}: no page /docs/${feature.page}`),
    ])
    expect(missing).toEqual([])
  })

  it('exports App from main.tsx', () => {
    const wrong = catalog.showcases.filter(
      (showcase) =>
        !/export (?:async )?(?:function|const) App\b/.test(
          readFileSync(join(folder, showcase.slug, 'main.tsx'), 'utf8'),
        ),
    )
    expect(wrong.map((showcase) => showcase.slug)).toEqual([])
  })

  it('imports public entry points and its own files only', () => {
    const wrong = catalog.showcases.flatMap((showcase) =>
      codeFiles(showcase.slug).flatMap((file) =>
        importsOf(readFileSync(join(folder, showcase.slug, file), 'utf8'))
          .filter((specifier) => {
            if (!isRelative(specifier)) {
              const module = moduleOf(specifier)
              return module.startsWith('@bruno00o/graph') && !publicModules.has(module)
            }
            return specifier.startsWith('../') && !specifier.startsWith('../types')
          })
          .map((specifier) => `${showcase.slug}/${file}: ${specifier}`),
      ),
    )
    expect(wrong).toEqual([])
  })

  it('keeps meta.ts free of runtime imports', () => {
    const wrong = catalog.showcases.filter((showcase) =>
      /^import (?!type )/m.test(readFileSync(join(folder, showcase.slug, 'meta.ts'), 'utf8')),
    )
    expect(wrong.map((showcase) => showcase.slug)).toEqual([])
  })

  it('ships the license text next to the data of every app', () => {
    const missing = catalog.showcases.filter(
      (showcase) =>
        !existsSync(join(folder, '../../public/showcase-data', showcase.slug, 'LICENSE')),
    )
    expect(missing.map((showcase) => showcase.slug)).toEqual([])
  })
})

describe('createCatalog', () => {
  it('accepts a complete app', () => {
    const { showcases, problems, missingThumbnails } = createCatalog(sample())
    expect(problems).toEqual([])
    expect(missingThumbnails).toEqual([])
    expect(showcases.map((showcase) => showcase.slug)).toEqual(['sample'])
  })

  it('reports malformed metadata', () => {
    const { problems, showcases } = createCatalog(
      sample({
        metas: {
          './sample/meta.ts': { ...meta, order: 'first', features: [], extra: true, api: [] },
        },
      }),
    )
    expect(showcases).toEqual([])
    expect(problems.join('\n')).toContain('unknown field "extra"')
    expect(problems.join('\n')).toContain('"order" must be a number')
    expect(problems.join('\n')).toContain('"features" must list')
    expect(problems.join('\n')).toContain('"api" must list')
  })

  it('reports a missing entry, a missing meta and a bad slug', () => {
    const { problems } = createCatalog({
      metas: { './Bad_Slug/meta.ts': meta },
      entries: { './orphan/main.tsx': load },
      images: {},
    })
    expect(problems).toContain(
      'Bad_Slug: the folder name is the slug, in lowercase words joined by hyphens',
    )
    expect(problems).toContain('Bad_Slug: missing main.tsx')
    expect(problems).toContain('orphan: missing meta.ts')
  })

  it('reports a thumbnail that is missing without refusing the app', () => {
    const { showcases, missingThumbnails } = createCatalog(sample({ images: {} }))
    expect(showcases[0]?.images).toBeNull()
    expect(missingThumbnails).toEqual(['sample/thumbnail.webp', 'sample/thumbnail-dark.webp'])
  })

  it('sorts by order, then title', () => {
    const { showcases } = createCatalog({
      metas: {
        './b/meta.ts': { ...meta, order: 20, title: 'B' },
        './a/meta.ts': { ...meta, order: 20, title: 'A' },
        './c/meta.ts': { ...meta, order: 5, title: 'C' },
      },
      entries: { './a/main.tsx': load, './b/main.tsx': load, './c/main.tsx': load },
      images: {},
    })
    expect(showcases.map((showcase) => showcase.slug)).toEqual(['c', 'a', 'b'])
  })
})
