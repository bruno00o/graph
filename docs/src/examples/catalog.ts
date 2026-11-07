import { type Category, type CategoryId, categories } from './categories'
import {
  type Example,
  type ExampleKind,
  type ExampleMeta,
  type ExampleModule,
  exampleTags,
  type LoadedExample,
} from './types'

export interface CatalogInput {
  readonly metas: Readonly<Record<string, unknown>>
  readonly entries: Readonly<Record<string, () => Promise<ExampleModule>>>
  readonly images: Readonly<Record<string, string>>
}

export interface Catalog {
  readonly examples: readonly Example[]
  readonly problems: readonly string[]
  readonly missingThumbnails: readonly string[]
}

export const thumbnailFiles = { light: 'thumbnail.webp', dark: 'thumbnail-dark.webp' } as const

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const pagePattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:#[a-z0-9-]+)?$/
const metaKeys = new Set([
  'title',
  'description',
  'hint',
  'category',
  'order',
  'tags',
  'api',
  'guides',
  'harness',
])
const categoryIds = new Set<string>(categories.map((category) => category.id))
const knownTags = new Set<string>(exampleTags)

function folderOf(path: string): string {
  return path.split('/')[1] ?? ''
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isList(value: unknown, pattern: RegExp): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string' && pattern.test(item)) &&
    new Set(value).size === value.length
  )
}

function checkMeta(slug: string, value: unknown, kind: ExampleKind | null): string[] {
  const problems: string[] = []
  const report = (message: string) => problems.push(`${slug}: ${message}`)
  if (!isRecord(value)) {
    report('meta.ts must export default an object')
    return problems
  }
  for (const key of Object.keys(value)) {
    if (!metaKeys.has(key)) report(`unknown field "${key}" in meta.ts`)
  }
  const { title, description, hint, category, order, tags, api, guides, harness } = value
  for (const [key, field] of Object.entries({ title, description, hint })) {
    if (!isText(field)) report(`"${key}" must be a non-empty string`)
  }
  if (typeof category !== 'string' || !categoryIds.has(category)) {
    report(`unknown category "${String(category)}"`)
  }
  if (typeof order !== 'number' || !Number.isFinite(order)) {
    report('"order" must be a finite number')
  }
  if (!isList(tags, /./) || tags.some((tag) => !knownTags.has(tag))) {
    report(`"tags" must list distinct tags among ${exampleTags.join(', ')}`)
  } else if (kind) {
    const framework = kind === 'react' ? 'React' : 'Vanilla'
    const other = kind === 'react' ? 'Vanilla' : 'React'
    if (!tags.includes(framework) || tags.includes(other)) {
      report(`"tags" must include ${framework} and not ${other}, after its entry file`)
    }
  }
  if (!isList(api, pagePattern) || api.length === 0) {
    report('"api" must list at least one page of /docs/api, such as "define-graph"')
  }
  if (!isList(guides, pagePattern)) {
    report('"guides" must list pages of /docs, such as "states" or "view#view-limits"')
  }
  if (harness !== undefined) {
    const { select, ...rest } = isRecord(harness) ? harness : { select: null, invalid: true }
    if (Object.keys(rest).length > 0) report('"harness" only takes { select?: boolean }')
    else if (select !== undefined && typeof select !== 'boolean') {
      report('"harness.select" must be a boolean')
    }
  }
  return problems
}

function loader(
  slug: string,
  kind: ExampleKind,
  load: () => Promise<ExampleModule>,
): () => Promise<LoadedExample> {
  return async () => {
    const module = await load()
    if (kind === 'vanilla' && module.mount) return { kind, mount: module.mount }
    if (kind === 'react' && module.Example) return { kind, Example: module.Example }
    throw new Error(
      `${slug}: ${kind === 'vanilla' ? 'main.ts must export mount' : 'main.tsx must export Example'}`,
    )
  }
}

function rank(category: CategoryId): number {
  return categories.findIndex((item) => item.id === category)
}

export function compareExamples(a: Example, b: Example): number {
  return (
    rank(a.category) - rank(b.category) ||
    a.order - b.order ||
    a.title.localeCompare(b.title, 'en') ||
    a.slug.localeCompare(b.slug, 'en')
  )
}

export function createCatalog(input: CatalogInput): Catalog {
  const problems: string[] = []
  const missingThumbnails: string[] = []
  const examples: Example[] = []
  const slugs = new Set([...Object.keys(input.metas), ...Object.keys(input.entries)].map(folderOf))
  const lowered = new Map<string, string>()
  for (const slug of [...slugs].sort()) {
    const twin = lowered.get(slug.toLowerCase())
    if (twin) problems.push(`${slug}: duplicate slug, also used by ${twin}`)
    lowered.set(slug.toLowerCase(), slug)
    if (!slugPattern.test(slug)) {
      problems.push(`${slug}: the folder name is the slug, in lowercase words joined by hyphens`)
    }
    const vanilla = input.entries[`./${slug}/main.ts`]
    const react = input.entries[`./${slug}/main.tsx`]
    if (vanilla && react) problems.push(`${slug}: keep main.ts or main.tsx, not both`)
    const kind: ExampleKind | null = vanilla ? 'vanilla' : react ? 'react' : null
    const load = vanilla ?? react
    if (!kind || !load) problems.push(`${slug}: missing main.ts or main.tsx`)
    const path = `./${slug}/meta.ts`
    if (!(path in input.metas)) {
      problems.push(`${slug}: missing meta.ts`)
      continue
    }
    const meta = input.metas[path]
    const found = checkMeta(slug, meta, kind)
    problems.push(...found)
    if (found.length > 0 || !kind || !load) continue
    const light = input.images[`./${slug}/${thumbnailFiles.light}`]
    const dark = input.images[`./${slug}/${thumbnailFiles.dark}`]
    if (!light) missingThumbnails.push(`${slug}/${thumbnailFiles.light}`)
    if (!dark) missingThumbnails.push(`${slug}/${thumbnailFiles.dark}`)
    examples.push({
      ...(meta as ExampleMeta),
      slug,
      kind,
      entry: kind === 'vanilla' ? 'main.ts' : 'main.tsx',
      thumbnail: light && dark ? { light, dark } : null,
      load: loader(slug, kind, load),
    })
  }
  examples.sort(compareExamples)
  return { examples, problems, missingThumbnails }
}

export const catalog: Catalog = createCatalog({
  metas: import.meta.glob('./*/meta.ts', { eager: true, import: 'default' }),
  entries: import.meta.glob<ExampleModule>(['./*/main.ts', './*/main.tsx']),
  images: import.meta.glob<string>(['./*/thumbnail.webp', './*/thumbnail-dark.webp'], {
    eager: true,
    query: '?url',
    import: 'default',
  }),
})

if (catalog.problems.length > 0) {
  throw new Error(`Invalid examples:\n${catalog.problems.join('\n')}`)
}

export const examples: readonly Example[] = catalog.examples

export function findExample(slug: string): Example | undefined {
  return examples.find((example) => example.slug === slug)
}

export function examplesIn(category: CategoryId): Example[] {
  return examples.filter((example) => example.category === category)
}

export function categoryOf(example: Example): Category {
  return categories.find((category) => category.id === example.category) ?? categories[0]
}

export function neighborsOf(example: Example): {
  readonly previous: Example | undefined
  readonly next: Example | undefined
} {
  const siblings = examplesIn(example.category)
  const index = siblings.indexOf(example)
  return { previous: siblings[index - 1], next: siblings[index + 1] }
}
