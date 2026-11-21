import { dev } from '../dev'
import type { Rgba } from '../dom/theme'
import { darkTheme } from '../theme/dark-tokens'
import { type GraphToken, lightTokens } from '../theme/tokens'

type Color = [number, number, number, number]

const named =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:0ff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000,blanchedalmond:ffebcd,blue:00f,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:0ff,darkblue:00008b,darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:f0f,gainsboro:dcdcdc,ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:789,lightslategrey:789,lightsteelblue:b0c4de,lightyellow:ffffe0,lime:0f0,limegreen:32cd32,linen:faf0e6,magenta:f0f,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:639,red:f00,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:fff,whitesmoke:f5f5f5,yellow:ff0,yellowgreen:9acd32'

let names: Map<string, string> | null = null

function namedColor(name: string): string | undefined {
  if (!names) {
    names = new Map()
    for (const pair of named.split(',')) {
      const at = pair.indexOf(':')
      names.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }
  return names.get(name)
}

function hex(text: string): Color | null {
  if (!/^[0-9a-f]+$/.test(text)) return null
  const short = text.length === 3 || text.length === 4
  if (!short && text.length !== 6 && text.length !== 8) return null
  const step = short ? 1 : 2
  const channel = (at: number): number => {
    const part = text.slice(at * step, at * step + step)
    return Number.parseInt(short ? part + part : part, 16)
  }
  const alpha = text.length === 4 || text.length === 8 ? channel(3) / 255 : 1
  return [channel(0), channel(1), channel(2), alpha]
}

function splitTop(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (depth === 0 && char === separator) {
      parts.push(text.slice(start, at))
      start = at + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

function words(text: string): string[] {
  return splitTop(text.replace(/\s+/g, ' '), ' ')
}

function number(text: string | undefined, percentScale: number): number {
  if (text === undefined || text === 'none') return 0
  if (text.endsWith('%')) return (Number.parseFloat(text) / 100) * percentScale
  return Number.parseFloat(text)
}

function hue(text: string | undefined): number {
  if (text === undefined || text === 'none') return 0
  const value = Number.parseFloat(text)
  if (text.endsWith('grad')) return value * 0.9
  if (text.endsWith('rad')) return (value * 180) / Math.PI
  if (text.endsWith('turn')) return value * 360
  return value
}

function channels(inside: string): {
  readonly values: string[]
  readonly alpha: string | undefined
} {
  if (inside.includes(',')) {
    const values = splitTop(inside, ',')
    return { values: values.slice(0, 3), alpha: values[3] }
  }
  const [main = '', alpha] = inside.split('/')
  return { values: words(main), alpha: alpha?.trim() }
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : low
}

function alphaOf(text: string | undefined): number {
  return text === undefined ? 1 : clamp(number(text, 1), 0, 1)
}

function rgb(inside: string): Color {
  const { values, alpha } = channels(inside)
  const [r, g, b] = values.map((value) => clamp(number(value, 255), 0, 255))
  return [r ?? 0, g ?? 0, b ?? 0, alphaOf(alpha)]
}

function hsl(inside: string): Color {
  const { values, alpha } = channels(inside)
  const h = (((hue(values[0]) % 360) + 360) % 360) / 360
  const s = clamp(number(values[1], 100), 0, 100) / 100
  const l = clamp(number(values[2], 100), 0, 100) / 100
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255, alphaOf(alpha)]
}

function toLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function fromLinear(value: number): number {
  const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
  return encoded * 255
}

function toOklab([r, g, b]: Color): [number, number, number] {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab(lightness: number, a: number, b: number): [number, number, number] {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

function split(part: string): { readonly color: string; readonly share: number | null } {
  const match = /\s(-?[\d.]+)%$/.exec(part) ?? /^(-?[\d.]+)%\s/.exec(part)
  if (!match) return { color: part, share: null }
  const color = (part.slice(0, match.index) + part.slice(match.index + match[0].length)).trim()
  return { color, share: Number.parseFloat(match[1] ?? '0') / 100 }
}

export type TokenReader = (name: string) => string | undefined

function mix(inside: string, tokens: TokenReader, depth: number): Color | null {
  const [space = '', first = '', second = ''] = splitTop(inside, ',')
  const one = split(first)
  const two = split(second)
  let p = one.share ?? (two.share === null ? 0.5 : 1 - two.share)
  let q = two.share ?? 1 - p
  const total = p + q
  if (!(total > 0)) return null
  p /= total
  q /= total
  const scale = Math.min(1, total)
  const a = parse(one.color, tokens, depth + 1)
  const b = parse(two.color, tokens, depth + 1)
  if (!a || !b) return null
  const alpha = a[3] * p + b[3] * q
  if (alpha === 0) return [0, 0, 0, 0]
  const oklab = space.replace(/^in\s+/, '').trim() === 'oklab'
  const [x0, y0, z0] = oklab ? toOklab(a) : [a[0], a[1], a[2]]
  const [x1, y1, z1] = oklab ? toOklab(b) : [b[0], b[1], b[2]]
  const x = (x0 * a[3] * p + x1 * b[3] * q) / alpha
  const y = (y0 * a[3] * p + y1 * b[3] * q) / alpha
  const z = (z0 * a[3] * p + z1 * b[3] * q) / alpha
  const [r, g, bl] = oklab ? fromOklab(x, y, z) : [x, y, z]
  return [r, g, bl, alpha * scale]
}

function substitute(text: string, tokens: TokenReader): string | null {
  const inside = text.slice(4, -1)
  const [name = '', ...rest] = splitTop(inside, ',')
  const fallback = rest.join(',').trim()
  const prefix = '--graph-'
  const value = name.startsWith(prefix) ? tokens(name.slice(prefix.length)) : undefined
  if (value !== undefined) return value
  return fallback === '' ? null : fallback
}

function parse(css: string, tokens: TokenReader, depth: number): Color | null {
  if (depth > 16) return null
  const text = css.trim().toLowerCase()
  if (text === '') return null
  if (text === 'transparent') return [0, 0, 0, 0]
  if (text.startsWith('#')) return hex(text.slice(1))
  const open = text.indexOf('(')
  if (open < 0) {
    const value = namedColor(text)
    return value === undefined ? null : hex(value)
  }
  if (!text.endsWith(')')) return null
  const name = text.slice(0, open).trim()
  const inside = text.slice(open + 1, -1)
  if (name === 'var') {
    const value = substitute(text, tokens)
    return value === null ? null : parse(value, tokens, depth + 1)
  }
  if (name === 'rgb' || name === 'rgba') return rgb(inside)
  if (name === 'hsl' || name === 'hsla') return hsl(inside)
  if (name === 'color-mix') return mix(inside, tokens, depth)
  return null
}

export function resolveColor(css: string, tokens: TokenReader): Rgba | null {
  const color = parse(css, tokens, 0)
  if (!color) return null
  return [
    Math.round(clamp(color[0], 0, 255)),
    Math.round(clamp(color[1], 0, 255)),
    Math.round(clamp(color[2], 0, 255)),
    Math.round(clamp(color[3], 0, 1) * 255),
  ]
}

/** Built-in themes of a graph without a page: `'light'` or `'dark'`. */
export type GraphThemeBase = 'light' | 'dark'

/** Theme of a graph made by `createGraph`, in place of the CSS variables of a page. */
export interface GraphThemeOptions {
  /**
   * Theme whose tokens fill the ones `colors` leaves out: `'light'` or `'dark'`.
   * @default 'light'
   */
  readonly base?: GraphThemeBase | undefined
  /**
   * Token values by name without the `--graph-` prefix, such as `{ accent: '#7a3ff2', 'cat-1':
   * 'teal' }`: hex, named colors, `rgb()`, `hsl()`, `color-mix()` and `var(--graph-…)`. A name
   * that is not a `GraphToken`, and a color that cannot be read, are reported with a warning in
   * development.
   */
  readonly colors?: Readonly<Partial<Record<GraphToken, string>>> | undefined
  /**
   * Font of the labels, as a CSS font family list, written into exports. Give the same font to
   * `measureText`, or the label boxes will not fit the text drawn.
   * @default 'Arial, "Liberation Sans", Helvetica, sans-serif'
   */
  readonly font?: string | undefined
}

/** A built-in theme by name, or a theme of its own. */
export type GraphTheme = GraphThemeBase | GraphThemeOptions

export function themeTokens(theme: GraphTheme | undefined): TokenReader {
  const input = typeof theme === 'string' ? { base: theme } : (theme ?? {})
  const base: Readonly<Record<string, string>> = input.base === 'dark' ? darkTheme : lightTokens
  const colors: Readonly<Record<string, string | undefined>> = input.colors ?? {}
  if (dev) {
    for (const name of Object.keys(colors)) {
      if (!(name in lightTokens)) {
        console.warn(`createGraph: "${name}" is not a theme token`)
      }
    }
  }
  return (name) => colors[name] ?? base[name]
}
