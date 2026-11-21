import { beforeAll, describe, expect, it, vi } from 'vitest'

type Og = typeof import('./og')
type Seo = typeof import('./seo')

interface Node {
  readonly '@type': string
  readonly codeRepository?: string
  readonly license?: string
  readonly itemListElement?: readonly { readonly position: number; readonly item: string }[]
}

let og: Og
let seo: Seo

beforeAll(async () => {
  vi.stubEnv('DOCS_ORIGIN', 'https://example.test/')
  vi.stubEnv('BASE_URL', '/graph/')
  og = await import('./og')
  seo = await import('./seo')
})

describe('ogPath', () => {
  it('maps a page to its image without base or slashes', () => {
    expect(og.ogPath('/')).toBe('og/index.png')
    expect(og.ogPath('')).toBe('og/index.png')
    expect(og.ogPath('/docs/quick-start/')).toBe('og/docs/quick-start.png')
    expect(og.ogPath('showcase/air-routes')).toBe('og/showcase/air-routes.png')
  })

  it('gives an absolute address', () => {
    expect(og.ogImage('/docs/quick-start')).toBe(
      'https://example.test/graph/og/docs/quick-start.png',
    )
  })
})

describe('previewImage', () => {
  it('uses the copy of a thumbnail, and a drawn image for any other page', () => {
    expect(og.previewImage('/examples/selection', true)).toEqual({
      url: 'https://example.test/graph/og/examples/selection.png',
      width: 640,
      height: 400,
    })
    expect(og.previewImage('/docs/quick-start', false)).toEqual({
      url: 'https://example.test/graph/og/docs/quick-start.png',
      width: 1200,
      height: 630,
    })
  })
})

describe('pageUrl', () => {
  it('ends every address with a slash', () => {
    expect(seo.pageUrl('/')).toBe('https://example.test/graph/')
    expect(seo.pageUrl('/docs')).toBe('https://example.test/graph/docs/')
    expect(seo.pageUrl('/docs/api/nodes/')).toBe('https://example.test/graph/docs/api/nodes/')
  })
})

describe('pageHead', () => {
  const base = { path: '/docs/layout', title: 'Layouts | graph', description: 'Place nodes.' }

  it('describes the page to search engines and link previews', () => {
    const { meta, links } = seo.pageHead({ ...base, type: 'article' })
    const content = (key: string) =>
      meta.find((item) => item.name === key || item.property === key)?.content
    expect(links).toEqual([{ rel: 'canonical', href: 'https://example.test/graph/docs/layout/' }])
    expect(content('og:url')).toBe('https://example.test/graph/docs/layout/')
    expect(content('og:type')).toBe('article')
    expect(content('og:title')).toBe('Layouts | graph')
    expect(content('twitter:card')).toBe('summary')
    expect(content('og:image')).toBeUndefined()
    expect(meta[0]).toEqual({ title: 'Layouts | graph' })
  })

  it('adds the image to both vocabularies', () => {
    const image = og.previewImage('/examples/lens', true)
    const { meta } = seo.pageHead({ ...base, path: '/examples/lens', image })
    const content = (key: string) =>
      meta.find((item) => item.name === key || item.property === key)?.content
    expect(content('twitter:card')).toBe('summary_large_image')
    expect(content('og:image')).toBe('https://example.test/graph/og/examples/lens.png')
    expect(content('twitter:image')).toBe(content('og:image'))
    expect(content('og:image:width')).toBe('640')
  })
})

describe('structured data', () => {
  const page = { path: '/docs/layout', title: 'Layouts', description: 'Place nodes.' }

  it('describes the site and the package with what the repository states', () => {
    const graph = seo.siteData()['@graph'] as readonly Node[]
    const code = graph.find((node) => node['@type'] === 'SoftwareSourceCode')
    expect(graph.map((node) => node['@type'])).toEqual(['WebSite', 'SoftwareSourceCode'])
    expect(code?.codeRepository).toBe('https://github.com/bruno00o/graph')
    expect(code?.license).toBe('https://spdx.org/licenses/MIT.html')
  })

  it('numbers the breadcrumb and ends it on the page', () => {
    const graph = seo.articleData(page, [
      { name: 'Home', url: 'https://example.test/graph/' },
      { name: 'Docs', url: 'https://example.test/graph/docs/' },
      { name: 'Layouts', url: 'https://example.test/graph/docs/layout/' },
    ])['@graph'] as readonly Node[]
    const list = graph.find((node) => node['@type'] === 'BreadcrumbList')
    const items = list?.itemListElement ?? []
    expect(items.map((item) => item.position)).toEqual([1, 2, 3])
    expect(items.at(-1)?.item).toBe('https://example.test/graph/docs/layout/')
  })
})
