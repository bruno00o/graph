import { dev } from '../dev'
import type { ResolvedTheme, Rgba } from '../dom/theme'
import type { ColorSource } from '../host/environment'
import { themeColor } from '../theme/tokens'
import { type GraphTheme, resolveColor, type TokenReader, themeTokens } from './colors'

export const headlessFont = 'Arial, "Liberation Sans", Helvetica, sans-serif'

const black: Rgba = [0, 0, 0, 255]

export class ScriptTheme implements ColorSource {
  readonly #tokens: TokenReader
  readonly #font: string
  readonly #cache = new Map<string, Rgba>()

  constructor(theme: GraphTheme | undefined) {
    this.#tokens = themeTokens(theme)
    this.#font = (typeof theme === 'object' ? theme.font : undefined) ?? headlessFont
  }

  color(css: string): Rgba {
    const known = this.#cache.get(css)
    if (known) return known
    const resolved = resolveColor(css, this.#tokens)
    if (resolved === null && dev) console.warn(`createGraph: cannot read the color "${css}"`)
    const color = resolved ?? black
    this.#cache.set(css, color)
    return color
  }

  palette(colors: readonly string[], target: Uint8Array, from = 0): void {
    for (let id = from; id < colors.length; id++) target.set(this.color(colors[id] ?? ''), id * 4)
  }

  theme(): ResolvedTheme {
    return {
      labelInk: this.color(themeColor('ink')),
      labelMuted: this.color(themeColor('ink-muted')),
      labelHalo: this.color(themeColor('label-halo')),
      labelPaper: this.color(themeColor('paper')),
      halo: this.color(themeColor('halo')),
      lensFill: this.color(themeColor('lens-fill')),
      lensRing: this.color(themeColor('lens-ring')),
      lensShadow: this.color(themeColor('lens-shadow')),
      font: this.#font,
    }
  }

  destroy(): void {
    this.#cache.clear()
  }
}
