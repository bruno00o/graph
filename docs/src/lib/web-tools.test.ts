import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RegisteredTool {
  readonly name: string
  readonly description: string
  readonly inputSchema: { type?: unknown; additionalProperties?: unknown; required?: unknown }
  readonly annotations: { readonly readOnlyHint: boolean }
  readonly execute: (input: Record<string, unknown>) => Promise<{
    content: { type: string; text: string }[]
    isError?: boolean
  }>
}

type WebTools = typeof import('./web-tools')

const search = vi.fn()

vi.mock('fumadocs-core/search/client/orama-static', () => ({
  staticClient: () => ({ search }),
}))

let tools: WebTools
let registered: RegisteredTool[]

function install(host: 'document' | 'navigator'): void {
  const context = {
    registerTool: (tool: RegisteredTool) => {
      registered.push(tool)
      return Promise.resolve()
    },
  }
  vi.stubGlobal('document', host === 'document' ? { modelContext: context } : {})
  vi.stubGlobal('navigator', host === 'navigator' ? { modelContext: context } : {})
  vi.stubGlobal('location', { origin: 'https://example.test' })
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('BASE_URL', '/graph/')
  registered = []
  search.mockReset()
  tools = await import('./web-tools')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function tool(name: string): RegisteredTool {
  const found = registered.find((item) => item.name === name)
  if (!found) throw new Error(`no tool ${name}`)
  return found
}

describe('registerWebTools', () => {
  it('registers four read-only tools with object schemas on document.modelContext', () => {
    install('document')
    tools.registerWebTools()
    expect(registered.map((item) => item.name).sort()).toEqual([
      'get_example',
      'list_examples',
      'read_docs_page',
      'search_docs',
    ])
    for (const item of registered) {
      expect(item.annotations.readOnlyHint).toBe(true)
      expect(item.description.length).toBeGreaterThan(20)
      expect(item.inputSchema.type).toBe('object')
      expect(item.inputSchema.additionalProperties).toBe(false)
      expect(item.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
    }
    expect(tool('search_docs').inputSchema.required).toEqual(['query'])
    expect(tool('list_examples').inputSchema).not.toHaveProperty('required')
  })

  it('registers once', () => {
    install('document')
    tools.registerWebTools()
    tools.registerWebTools()
    expect(registered).toHaveLength(4)
  })

  it('falls back to navigator.modelContext', () => {
    install('navigator')
    tools.registerWebTools()
    expect(registered).toHaveLength(4)
  })

  it('does nothing without a model context', () => {
    vi.stubGlobal('document', {})
    vi.stubGlobal('navigator', {})
    expect(tools.modelContextOf()).toBeUndefined()
    expect(() => tools.registerWebTools()).not.toThrow()
    expect(registered).toHaveLength(0)
  })

  it('survives a registration that throws or rejects', async () => {
    const calls: string[] = []
    vi.stubGlobal('document', {
      modelContext: {
        registerTool: (item: { name: string }) => {
          calls.push(item.name)
          if (calls.length === 1) throw new Error('refused')
          return Promise.reject(new Error('refused'))
        },
      },
    })
    vi.stubGlobal('navigator', {})
    expect(() => tools.registerWebTools()).not.toThrow()
    await Promise.resolve()
    expect(calls).toHaveLength(4)
  })
})

describe('search_docs', () => {
  it('lists distinct pages up to the limit, with the path to read', async () => {
    install('document')
    tools.registerWebTools()
    search.mockResolvedValue([
      {
        id: '1',
        url: '/docs/layout',
        type: 'page',
        content: 'Layouts',
        breadcrumbs: ['Docs', 'Guides'],
      },
      { id: '2', url: '/docs/layout', type: 'text', content: 'again' },
      { id: '3', url: '/docs/api/force#options', type: 'heading', content: 'Options' },
      { id: '4', url: '/docs/marks', type: 'page', content: 'Marks' },
    ])
    const out = await tool('search_docs').execute({ query: 'force', limit: 2 })
    const parsed = JSON.parse(out.content[0]?.text ?? '{}')
    expect(parsed.results).toHaveLength(2)
    expect(parsed.results[0]).toMatchObject({
      title: 'Layouts',
      section: 'Guides',
      url: 'https://example.test/graph/docs/layout',
      read: { tool: 'read_docs_page', path: 'layout' },
    })
    expect(parsed.results[1].read.path).toBe('api/force')
  })

  it('refuses an empty query', async () => {
    install('document')
    tools.registerWebTools()
    const out = await tool('search_docs').execute({ query: '  ' })
    expect(out.isError).toBe(true)
    expect(search).not.toHaveBeenCalled()
  })
})

describe('read_docs_page', () => {
  it('reads the Markdown page of a path, however it is written', async () => {
    install('document')
    tools.registerWebTools()
    const fetched: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url)
      return new Response('# Page', { status: 200 })
    })
    for (const path of [
      'api/define-graph',
      '/docs/api/define-graph.md',
      '/graph/docs/api/define-graph/',
    ]) {
      const out = await tool('read_docs_page').execute({ path })
      expect(out.content[0]?.text).toBe('# Page')
    }
    await tool('read_docs_page').execute({})
    expect(fetched.slice(0, 3)).toEqual(
      Array(3).fill('https://example.test/graph/docs/api/define-graph.md'),
    )
    expect(fetched[3]).toBe('https://example.test/graph/docs/index.md')
  })

  it('reports an unknown page as an error', async () => {
    install('document')
    tools.registerWebTools()
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    const out = await tool('read_docs_page').execute({ path: 'nope' })
    expect(out.isError).toBe(true)
  })
})

describe('examples', () => {
  it('filters the list by category and tag', async () => {
    install('document')
    tools.registerWebTools()
    const all = JSON.parse((await tool('list_examples').execute({})).content[0]?.text ?? '{}')
    const layouts = JSON.parse(
      (await tool('list_examples').execute({ category: 'layouts' })).content[0]?.text ?? '{}',
    )
    const react = JSON.parse(
      (await tool('list_examples').execute({ tag: 'react' })).content[0]?.text ?? '{}',
    )
    expect(all.count).toBeGreaterThan(layouts.count)
    expect(layouts.count).toBeGreaterThan(0)
    expect(
      layouts.examples.every((item: { category: string }) => item.category === 'layouts'),
    ).toBe(true)
    expect(react.examples.every((item: { tags: string[] }) => item.tags.includes('React'))).toBe(
      true,
    )
  })

  it('gives the address of an example and the Markdown pages it relates to', async () => {
    install('document')
    tools.registerWebTools()
    const first = JSON.parse((await tool('list_examples').execute({})).content[0]?.text ?? '{}')
      .examples[0]
    const out = await tool('get_example').execute({ slug: first.slug })
    const example = JSON.parse(out.content[0]?.text ?? '{}')
    expect(example.url).toBe(`https://example.test/graph/examples/${first.slug}`)
    expect(example.api.every((url: string) => url.includes('/graph/docs/api/'))).toBe(true)
    expect(example.api.length).toBeGreaterThan(0)
  })

  it('reports an unknown slug as an error', async () => {
    install('document')
    tools.registerWebTools()
    const out = await tool('get_example').execute({ slug: 'no-such-example' })
    expect(out.isError).toBe(true)
  })
})
