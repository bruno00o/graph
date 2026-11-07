import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type CatalogInput, catalog, createCatalog, thumbnailFiles } from './catalog'
import { importsOf, isRelative, moduleOf, tagsOf } from './imports'
import type { ExampleMeta, ExampleModule } from './types'

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
  return readdirSync(join(folder, slug))
    .filter((file) => /\.(ts|tsx|css)$/.test(file) && file !== 'meta.ts')
    .filter((file) => !file.endsWith('.test.ts'))
}

const meta: ExampleMeta = {
  title: 'Sample',
  description: 'A sample.',
  hint: 'Try it.',
  category: 'basics',
  order: 10,
  tags: ['Vanilla'],
  api: ['define-graph'],
  guides: [],
}

const load = (): Promise<ExampleModule> => Promise.resolve({})

function sample(overrides: Partial<CatalogInput> = {}): CatalogInput {
  return {
    metas: { './sample/meta.ts': meta },
    entries: { './sample/main.ts': load },
    images: {
      [`./sample/${thumbnailFiles.light}`]: '/light.webp',
      [`./sample/${thumbnailFiles.dark}`]: '/dark.webp',
    },
    ...overrides,
  }
}

describe('example catalog', () => {
  it('reads every example folder without a problem', () => {
    expect(catalog.problems).toEqual([])
    expect(catalog.examples.length).toBeGreaterThan(0)
  })

  it('has a light and a dark thumbnail for every example', () => {
    expect(catalog.missingThumbnails).toEqual([])
  })

  it('links only to docs pages that exist', () => {
    const missing = catalog.examples.flatMap((example) => [
      ...example.api
        .filter((page) => !pageExists(join(docs, 'api'), page))
        .map((page) => `${example.slug}: no page /docs/api/${page}`),
      ...example.guides
        .filter((page) => !pageExists(join(docs, '(guide)'), page))
        .map((page) => `${example.slug}: no page /docs/${page}`),
    ])
    expect(missing).toEqual([])
  })

  it('lists the tags its imports imply', () => {
    const wrong = catalog.examples.flatMap((example) => {
      const specifiers = codeFiles(example.slug).flatMap((file) =>
        importsOf(readFileSync(join(folder, example.slug, file), 'utf8')),
      )
      const expected = tagsOf(example.kind, specifiers)
      const same =
        expected.length === example.tags.length &&
        expected.every((tag) => example.tags.includes(tag))
      return same ? [] : [`${example.slug}: tags should be ${JSON.stringify(expected)}`]
    })
    expect(wrong).toEqual([])
  })

  it('exports mount from main.ts and Example from main.tsx', () => {
    const wrong = catalog.examples.filter((example) => {
      const code = readFileSync(join(folder, example.slug, example.entry), 'utf8')
      const name = example.kind === 'vanilla' ? 'mount' : 'Example'
      return !new RegExp(`export (?:async )?(?:function|const) ${name}\\b`).test(code)
    })
    expect(wrong.map((example) => example.slug)).toEqual([])
  })

  it('imports public entry points, its own files and shared files only', () => {
    const wrong = catalog.examples.flatMap((example) =>
      codeFiles(example.slug).flatMap((file) =>
        importsOf(readFileSync(join(folder, example.slug, file), 'utf8'))
          .filter((specifier) => {
            if (!isRelative(specifier)) {
              const module = moduleOf(specifier)
              return module.startsWith('@bruno00o/graph') && !publicModules.has(module)
            }
            const target = relative(folder, normalize(join(folder, example.slug, specifier)))
            return !target.startsWith(`${example.slug}/`) && !target.startsWith('shared/')
          })
          .map((specifier) => `${example.slug}/${file}: ${specifier}`),
      ),
    )
    expect(wrong).toEqual([])
  })

  it('replaces the text of the scaffold', () => {
    const wrong = catalog.examples.filter((example) =>
      /^One (?:or two )?sentences? on what/m.test(`${example.description}\n${example.hint}`),
    )
    expect(wrong.map((example) => example.slug)).toEqual([])
  })

  it('keeps meta.ts free of runtime imports', () => {
    const wrong = catalog.examples.filter((example) =>
      /^import (?!type )/m.test(readFileSync(join(folder, example.slug, 'meta.ts'), 'utf8')),
    )
    expect(wrong.map((example) => example.slug)).toEqual([])
  })
})

describe('createCatalog', () => {
  it('accepts a complete example', () => {
    const { examples, problems, missingThumbnails } = createCatalog(sample())
    expect(problems).toEqual([])
    expect(missingThumbnails).toEqual([])
    expect(examples.map((example) => [example.slug, example.kind])).toEqual([['sample', 'vanilla']])
  })

  it('reports malformed metadata', () => {
    const { problems } = createCatalog(
      sample({ metas: { './sample/meta.ts': { ...meta, title: '', order: 'first', extra: 1 } } }),
    )
    expect(problems).toEqual([
      'sample: unknown field "extra" in meta.ts',
      'sample: "title" must be a non-empty string',
      'sample: "order" must be a finite number',
    ])
  })

  it('reports an unknown category', () => {
    const { problems } = createCatalog(
      sample({ metas: { './sample/meta.ts': { ...meta, category: 'misc' } } }),
    )
    expect(problems).toEqual(['sample: unknown category "misc"'])
  })

  it('reports tags that contradict the entry file', () => {
    const { problems } = createCatalog(
      sample({ metas: { './sample/meta.ts': { ...meta, tags: ['React'] } } }),
    )
    expect(problems).toEqual([
      'sample: "tags" must include Vanilla and not React, after its entry file',
    ])
  })

  it('reports a duplicate slug', () => {
    const { problems } = createCatalog(
      sample({
        metas: { './sample/meta.ts': meta, './Sample/meta.ts': meta },
        entries: { './sample/main.ts': load, './Sample/main.ts': load },
      }),
    )
    expect(problems).toContain('sample: duplicate slug, also used by Sample')
  })

  it('reports a missing entry or metadata file', () => {
    expect(createCatalog(sample({ entries: {} })).problems).toContain(
      'sample: missing main.ts or main.tsx',
    )
    expect(createCatalog(sample({ metas: {} })).problems).toEqual(['sample: missing meta.ts'])
  })

  it('reports a missing thumbnail', () => {
    const { examples, missingThumbnails } = createCatalog(sample({ images: {} }))
    expect(missingThumbnails).toEqual([
      `sample/${thumbnailFiles.light}`,
      `sample/${thumbnailFiles.dark}`,
    ])
    expect(examples[0]?.thumbnail).toBeNull()
  })
})
