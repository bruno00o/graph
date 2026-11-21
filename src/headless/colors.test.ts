import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { darkTheme } from '../theme/dark-tokens'
import { type GraphToken, lightTheme } from '../theme/tokens'
import { type GraphThemeOptions, resolveColor, themeTokens } from './colors'
import { ScriptTheme } from './theme'

const [, ...cases] = readFileSync(new URL('./chrome-colors.tsv', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.split('\t'))

function premultiplied([r, g, b, a]: readonly number[]): number[] {
  const alpha = (a ?? 0) / 255
  return [(r ?? 0) * alpha, (g ?? 0) * alpha, (b ?? 0) * alpha, a ?? 0]
}

describe('resolveColor', () => {
  it('resolves the colors of Chrome within one level once premultiplied', () => {
    const misses: string[] = []
    for (const [theme = '', css = '', expected = ''] of cases) {
      const tokens = themeTokens(theme === 'dark' ? 'dark' : 'light')
      const got = resolveColor(css, tokens)
      const want = premultiplied(expected.split(',').map(Number))
      const gap = got
        ? Math.max(...premultiplied(got).map((value, at) => Math.abs(value - (want[at] ?? 0))))
        : Number.POSITIVE_INFINITY
      if (gap > 1) misses.push(`${theme} ${css}: ${got?.join(',')} for ${expected}`)
    }
    expect(cases.length).toBe(518)
    expect(misses).toEqual([])
  })

  it('reads tokens of its own over a base theme', () => {
    const tokens = themeTokens({ base: 'dark', colors: { accent: 'rebeccapurple' } })
    expect(resolveColor('var(--graph-accent)', tokens)).toEqual([102, 51, 153, 255])
    expect(resolveColor('var(--graph-ink)', tokens)).toEqual([239, 238, 235, 255])
    expect(resolveColor('var(--graph-unknown, #010203)', tokens)).toEqual([1, 2, 3, 255])
    expect(resolveColor('var(--graph-unknown)', tokens)).toBeNull()
    expect(resolveColor('not a color', tokens)).toBeNull()
  })

  it('keeps the dark tokens of TypeScript with the same names as the light ones', () => {
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort())
  })
})

describe('ScriptTheme', () => {
  it('fills a palette and a resolved theme', () => {
    const theme = new ScriptTheme({ base: 'dark', font: 'Inter' })
    const target = new Uint8Array(8)
    theme.palette(['#ff000080', 'nonsense'], target)
    expect([...target]).toEqual([255, 0, 0, 128, 0, 0, 0, 255])
    expect(theme.theme().font).toBe('Inter')
    expect(theme.theme().labelInk).toEqual([239, 238, 235, 255])
    expect(new ScriptTheme('light').theme().font).toBe(
      'Arial, "Liberation Sans", Helvetica, sans-serif',
    )
  })
})

describe('GraphToken', () => {
  it('names the tokens of tokens.ts, which colors takes by name', () => {
    expectTypeOf<GraphToken>().toEqualTypeOf<keyof typeof lightTheme>()
    expectTypeOf<NonNullable<GraphThemeOptions['colors']>>().toEqualTypeOf<
      Readonly<Partial<Record<GraphToken, string>>>
    >()
    const names: GraphToken[] = ['paper', 'accent', 'cat-12']
    expect(names.every((name) => name in lightTheme)).toBe(true)
    const wrong: GraphThemeOptions = {
      colors: {
        // @ts-expect-error
        acent: '#fff',
      },
    }
    expect(wrong).toBeDefined()
  })
})

describe('theme warnings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns about a token name that does not exist', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    themeTokens({ colors: { accent: '#fff', acent: '#000' } as never })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('"acent"')
  })

  it('warns once about a color it cannot read, and draws it black', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const theme = new ScriptTheme('light')
    expect(theme.color('nonsense')).toEqual([0, 0, 0, 255])
    expect(theme.color('nonsense')).toEqual([0, 0, 0, 255])
    expect(theme.color('#fff')).toEqual([255, 255, 255, 255])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('"nonsense"')
  })
})
