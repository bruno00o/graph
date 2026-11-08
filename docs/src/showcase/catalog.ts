import type { Showcase, ShowcaseApp, ShowcaseMeta, ShowcaseModule } from './types'

export interface CatalogInput {
  readonly metas: Readonly<Record<string, unknown>>
  readonly entries: Readonly<Record<string, () => Promise<ShowcaseModule>>>
  readonly images: Readonly<Record<string, string>>
}

export interface Catalog {
  readonly showcases: readonly Showcase[]
  readonly problems: readonly string[]
  readonly missingThumbnails: readonly string[]
}

export const thumbnailFiles = { light: 'thumbnail.webp', dark: 'thumbnail-dark.webp' } as const

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const pagePattern = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:#[a-z0-9-]+)?$/
const metaKeys = new Set([
  'title',
  'description',
  'domain',
  'order',
  'tags',
  'features',
  'api',
  'source',
])
const sourceKeys = new Set(['name', 'url', 'license', 'licenseUrl', 'build'])
const optionalSourceKeys = new Set(['note'])

function folderOf(path: string): string {
  return path.split('/')[1] ?? ''
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFeature(item: unknown): boolean {
  if (!isRecord(item)) return false
  const { text, page } = item
  return isText(text) && isText(page) && pagePattern.test(page)
}

function checkMeta(slug: string, value: unknown): string[] {
  const problems: string[] = []
  const report = (message: string) => problems.push(`${slug}: ${message}`)
  if (!isRecord(value)) return [`${slug}: meta.ts must export default an object`]
  for (const key of Object.keys(value)) {
    if (!metaKeys.has(key)) report(`unknown field "${key}" in meta.ts`)
  }
  const { title, description, domain, order, tags, features, api, source } = value
  for (const [key, field] of Object.entries({ title, description, domain })) {
    if (!isText(field)) report(`"${key}" must be a non-empty string`)
  }
  if (typeof order !== 'number' || !Number.isFinite(order)) report('"order" must be a number')
  if (!Array.isArray(tags) || tags.length === 0 || !tags.every(isText)) {
    report('"tags" must list at least one non-empty string')
  }
  if (!Array.isArray(features) || features.length === 0 || !features.every(isFeature)) {
    report('"features" must list { text, page } with a page of /docs, such as "map#globe"')
  }
  if (
    !Array.isArray(api) ||
    api.length === 0 ||
    !api.every((item) => pagePattern.test(String(item)))
  ) {
    report('"api" must list at least one page of /docs/api')
  }
  if (
    !isRecord(source) ||
    Object.keys(source).some((key) => !sourceKeys.has(key) && !optionalSourceKeys.has(key))
  ) {
    report('"source" must be { name, url, license, licenseUrl, build, note? }')
  } else {
    for (const key of sourceKeys) {
      if (!isText(source[key])) report(`"source.${key}" must be a non-empty string`)
    }
    for (const key of optionalSourceKeys) {
      if (key in source && !isText(source[key])) {
        report(`"source.${key}" must be a non-empty string`)
      }
    }
  }
  return problems
}

function loader(slug: string, load: () => Promise<ShowcaseModule>): () => Promise<ShowcaseApp> {
  return async () => {
    const module = await load()
    if (module.App) return module.App
    throw new Error(`${slug}: main.tsx must export App`)
  }
}

export function compareShowcases(a: Showcase, b: Showcase): number {
  return a.order - b.order || a.title.localeCompare(b.title, 'en') || a.slug.localeCompare(b.slug)
}

export function createCatalog(input: CatalogInput): Catalog {
  const problems: string[] = []
  const missingThumbnails: string[] = []
  const showcases: Showcase[] = []
  const slugs = new Set([...Object.keys(input.metas), ...Object.keys(input.entries)].map(folderOf))
  for (const slug of [...slugs].sort()) {
    if (!slugPattern.test(slug)) {
      problems.push(`${slug}: the folder name is the slug, in lowercase words joined by hyphens`)
    }
    const load = input.entries[`./${slug}/main.tsx`]
    if (!load) problems.push(`${slug}: missing main.tsx`)
    const path = `./${slug}/meta.ts`
    if (!(path in input.metas)) {
      problems.push(`${slug}: missing meta.ts`)
      continue
    }
    const meta = input.metas[path]
    const found = checkMeta(slug, meta)
    problems.push(...found)
    if (found.length > 0 || !load) continue
    const light = input.images[`./${slug}/${thumbnailFiles.light}`]
    const dark = input.images[`./${slug}/${thumbnailFiles.dark}`]
    if (!light) missingThumbnails.push(`${slug}/${thumbnailFiles.light}`)
    if (!dark) missingThumbnails.push(`${slug}/${thumbnailFiles.dark}`)
    showcases.push({
      ...(meta as ShowcaseMeta),
      slug,
      images: light && dark ? { light, dark } : null,
      load: loader(slug, load),
    })
  }
  showcases.sort(compareShowcases)
  return { showcases, problems, missingThumbnails }
}

export const catalog: Catalog = createCatalog({
  metas: import.meta.glob('./*/meta.ts', { eager: true, import: 'default' }),
  entries: import.meta.glob<ShowcaseModule>('./*/main.tsx'),
  images: import.meta.glob<string>(['./*/thumbnail.webp', './*/thumbnail-dark.webp'], {
    eager: true,
    query: '?url',
    import: 'default',
  }),
})

if (catalog.problems.length > 0) {
  const message = `Invalid showcase:\n${catalog.problems.join('\n')}`
  if (!import.meta.env.DEV) throw new Error(message)
  console.error(message)
}

export const showcases: readonly Showcase[] = catalog.showcases

export function findShowcase(slug: string): Showcase | undefined {
  return showcases.find((item) => item.slug === slug)
}

export function problemsOf(slug: string): readonly string[] {
  return catalog.problems.filter((problem) => problem.startsWith(`${slug}: `))
}
