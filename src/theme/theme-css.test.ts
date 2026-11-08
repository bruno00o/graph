import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lightTheme } from './tokens'

interface Block {
  readonly selector: string
  readonly media: string | null
  readonly declarations: ReadonlyMap<string, string>
}

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const rule = /([^{}]+)\{([^{}]*)\}|@media([^{]+)\{|\}/g
  let media: string | null = null
  for (const match of source.matchAll(rule)) {
    if (match[3] !== undefined) media = match[3].trim()
    else if (match[1] === undefined) media = null
    else {
      const declarations = new Map<string, string>()
      for (const line of (match[2] ?? '').split(';')) {
        const at = line.indexOf(':')
        if (at > 0) declarations.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
      }
      blocks.push({ selector: match[1].replace(/\s+/g, ' ').trim(), media, declarations })
    }
  }
  return blocks
}

const blocks = parse(readFileSync(new URL('./theme.css', import.meta.url), 'utf8'))

function find(selector: string, media: string | null = null): Block {
  const block = blocks.find((entry) => entry.selector === selector && entry.media === media)
  if (!block) throw new Error(`missing block ${selector}`)
  return block
}

const light = find(':root, .light, [data-theme="light"]')
const dark = find('.dark, [data-theme="dark"]')
const system = find(':root:not(.light):not([data-theme="light"])', '(prefers-color-scheme: dark)')

describe('theme.css', () => {
  it('forces each theme on any element, inside the other one', () => {
    expect(light.declarations.get('color-scheme')).toBe('light')
    expect(dark.declarations.get('color-scheme')).toBe('dark')
  })

  it('repeats the dark tokens for the system preference without drift', () => {
    expect([...system.declarations]).toEqual([...dark.declarations])
  })

  it('sets the same tokens in the light and dark themes', () => {
    expect([...dark.declarations.keys()].sort()).toEqual([...light.declarations.keys()].sort())
  })

  it('matches the light fallbacks used when the stylesheet is missing', () => {
    for (const [name, value] of Object.entries(lightTheme)) {
      expect(light.declarations.get(`--graph-${name}`)).toBe(value)
    }
  })

  it('keeps the font out of the light block so a nested light theme keeps an override', () => {
    expect(light.declarations.has('--graph-font')).toBe(false)
    expect(find(':root').declarations.has('--graph-font')).toBe(true)
  })
})
