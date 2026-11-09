import type { Example } from '../examples/types'
import { messages } from '../messages'

interface ToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  readonly isError?: true
}

interface ToolInput {
  readonly query?: unknown
  readonly limit?: unknown
  readonly path?: unknown
  readonly category?: unknown
  readonly tag?: unknown
  readonly text?: unknown
  readonly slug?: unknown
}

interface WebTool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly annotations: { readonly readOnlyHint: true }
  readonly execute: (input: ToolInput) => Promise<ToolResult>
}

interface ModelContext {
  readonly registerTool: (tool: WebTool, options?: { readonly signal?: AbortSignal }) => unknown
}

const base = import.meta.env.BASE_URL
const text = messages.agents.tools
const defaultLimit = 8
const maxLimit = 20
const maxTitle = 160

let registered = false

export function modelContextOf(): ModelContext | undefined {
  const fromDocument: unknown = Reflect.get(document, 'modelContext')
  const fromNavigator: unknown = Reflect.get(navigator, 'modelContext')
  const found = fromDocument ?? fromNavigator
  return typeof found === 'object' &&
    found !== null &&
    typeof Reflect.get(found, 'registerTool') === 'function'
    ? (found as ModelContext)
    : undefined
}

function answer(value: string, failed = false): ToolResult {
  return failed
    ? { content: [{ type: 'text', text: value }], isError: true }
    : { content: [{ type: 'text', text: value }] }
}

function json(value: unknown): ToolResult {
  return answer(JSON.stringify(value, null, 2))
}

function siteUrl(path: string): string {
  return new URL(`${base}${path.replace(/^\/+/, '')}`, location.origin).href
}

function wordsOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function limitOf(value: unknown): number {
  const number =
    typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : defaultLimit
  return Math.min(maxLimit, Math.max(1, number))
}

function pagePath(value: unknown): string {
  return wordsOf(value)
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(base, '/')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^docs(\/|$)/, '')
    .replace(/\.md$/, '')
}

async function searchDocs(input: ToolInput): Promise<ToolResult> {
  const query = wordsOf(input.query)
  if (query === '') return answer(text.queryText, true)
  const { staticClient } = await import('fumadocs-core/search/client/orama-static')
  const results = await staticClient({ from: `${base}api/search` }).search(query)
  const limit = limitOf(input.limit)
  const seen = new Set<string>()
  const hits: Record<string, unknown>[] = []
  for (const result of results) {
    if (seen.has(result.url)) continue
    seen.add(result.url)
    const path = pagePath(result.url)
    hits.push({
      title: result.content.slice(0, maxTitle),
      section: (result.breadcrumbs ?? []).slice(1).join(' > '),
      kind: result.type,
      url: siteUrl(result.url),
      read: { tool: text.readName, path },
    })
    if (hits.length === limit) break
  }
  return json({ query, results: hits })
}

async function readDocsPage(input: ToolInput): Promise<ToolResult> {
  const path = pagePath(input.path)
  const response = await fetch(siteUrl(`docs/${path === '' ? 'index' : path}.md`))
  if (!response.ok) return answer(text.unknownPage, true)
  return answer(await response.text())
}

function summary(example: Example): Record<string, unknown> {
  return {
    slug: example.slug,
    title: example.title,
    description: example.description,
    category: example.category,
    tags: example.tags,
    url: siteUrl(`examples/${example.slug}`),
  }
}

async function listExamples(input: ToolInput): Promise<ToolResult> {
  const { examples } = await import('../examples/catalog')
  const category = wordsOf(input.category).toLowerCase()
  const tag = wordsOf(input.tag).toLowerCase()
  const words = wordsOf(input.text).toLowerCase().split(/\s+/).filter(Boolean)
  const found = examples.filter(
    (example) =>
      (category === '' || example.category === category) &&
      (tag === '' || example.tags.some((item) => item.toLowerCase() === tag)) &&
      words.every((word) => `${example.title} ${example.description}`.toLowerCase().includes(word)),
  )
  return json({ count: found.length, examples: found.map(summary) })
}

async function getExample(input: ToolInput): Promise<ToolResult> {
  const { findExample } = await import('../examples/catalog')
  const example = findExample(wordsOf(input.slug))
  if (!example) return answer(text.unknownExample, true)
  return json({
    ...summary(example),
    hint: example.hint,
    guides: example.guides.map((page) => siteUrl(`docs/${page.replace(/#.*$/, '')}.md`)),
    api: example.api.map((page) => siteUrl(`docs/api/${page.replace(/#.*$/, '')}.md`)),
  })
}

function schema(
  properties: Readonly<Record<string, unknown>>,
  required: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

function tools(): readonly WebTool[] {
  const annotations = { readOnlyHint: true } as const
  return [
    {
      name: text.searchName,
      title: text.searchName,
      description: text.searchText,
      inputSchema: schema(
        {
          query: { type: 'string', minLength: 1, description: text.queryText },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: maxLimit,
            default: defaultLimit,
            description: text.limitText,
          },
        },
        ['query'],
      ),
      annotations,
      execute: searchDocs,
    },
    {
      name: text.readName,
      title: text.readName,
      description: text.readText,
      inputSchema: schema({ path: { type: 'string', description: text.pathText } }),
      annotations,
      execute: readDocsPage,
    },
    {
      name: text.listName,
      title: text.listName,
      description: text.listText,
      inputSchema: schema({
        category: { type: 'string', description: text.categoryText },
        tag: { type: 'string', description: text.tagText },
        text: { type: 'string', description: text.textText },
      }),
      annotations,
      execute: listExamples,
    },
    {
      name: text.exampleName,
      title: text.exampleName,
      description: text.exampleText,
      inputSchema: schema({ slug: { type: 'string', minLength: 1, description: text.slugText } }, [
        'slug',
      ]),
      annotations,
      execute: getExample,
    },
  ]
}

export function registerWebTools(): void {
  const context = modelContextOf()
  if (!context || registered) return
  registered = true
  for (const tool of tools()) {
    try {
      Promise.resolve(context.registerTool(tool)).catch(() => undefined)
    } catch {}
  }
}
