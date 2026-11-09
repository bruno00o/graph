import { beforeAll, describe, expect, it, vi } from 'vitest'
import { examples } from '../examples/catalog'

type AgentText = typeof import('./agent-text')

let text: AgentText

beforeAll(async () => {
  vi.stubEnv('DOCS_ORIGIN', 'https://example.test/')
  vi.stubEnv('BASE_URL', '/graph/')
  text = await import('./agent-text')
})

describe('absoluteUrl', () => {
  it('joins the origin, the base and the path', () => {
    expect(text.absoluteUrl('llms.txt')).toBe('https://example.test/graph/llms.txt')
    expect(text.absoluteUrl('/docs/index.md')).toBe('https://example.test/graph/docs/index.md')
  })
})

describe('cleaned', () => {
  const slug = examples[0]?.slug ?? ''

  it('points docs links at the Markdown pages and other links at the pages', () => {
    const out = text.cleaned(
      'See [marks](/docs/marks#channels), [docs](/docs) and [more](/examples).',
    )
    expect(out).toBe(
      'See [marks](https://example.test/graph/docs/marks.md#channels), ' +
        '[docs](https://example.test/graph/docs/index.md) and ' +
        '[more](https://example.test/graph/examples).',
    )
  })

  it('turns live examples, callouts and cards into plain Markdown', () => {
    const out = text.cleaned(
      [
        `<LiveExample slug="${slug}" />`,
        '',
        '<Callout title="Limit">',
        'First line.',
        'Second line.',
        '</Callout>',
        '',
        '<Cards>',
        '  <Card title="Marks" href="/docs/marks">',
        '    Map fields to channels.',
        '  </Card>',
        '  <Card title="Example" href="/examples/x" />',
        '</Cards>',
      ].join('\n'),
    )
    expect(out).toContain(`](https://example.test/graph/examples/${slug})`)
    expect(out).toContain('> **Limit.** First line.\n> Second line.')
    expect(out).toContain('- [Marks](https://example.test/graph/docs/marks.md): Map fields')
    expect(out).toContain('- [Example](https://example.test/graph/examples/x)')
    expect(out).not.toMatch(/<(?:LiveExample|Callout|Cards?)\b/)
  })

  it('drops a live example that does not exist', () => {
    const out = text.cleaned('Before.\n\n<LiveExample slug="no-such-example" />\n\nAfter.')
    expect(out).toBe('Before.\n\nAfter.')
  })

  it('squeezes the padding of tables', () => {
    const out = text.cleaned(
      ['| Prop    | Type      |', '| ------- | --------- |', '| `a`     | `string`  |'].join('\n'),
    )
    expect(out).toBe(['| Prop | Type |', '| --- | --- |', '| `a` | `string` |'].join('\n'))
  })

  it('leaves fenced code alone', () => {
    const code = ['```tsx', '<Callout title="x">', '[a](/docs/marks)', '| a    | b |', '```'].join(
      '\n',
    )
    expect(text.cleaned(code)).toBe(code)
  })
})
