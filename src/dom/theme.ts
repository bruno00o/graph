import { defaultFont, lightTheme, themeColor } from '../theme/tokens'

export type Rgba = readonly [number, number, number, number]

export interface ResolvedTheme {
  readonly labelInk: Rgba
  readonly labelMuted: Rgba
  readonly labelHalo: Rgba
  readonly halo: Rgba
  readonly lensFill: Rgba
  readonly lensRing: Rgba
  readonly lensShadow: Rgba
  readonly font: string
}

const tokenPattern = /var\(\s*--graph-([a-z0-9-]+)\s*\)/g

export function withFallbacks(color: string): string {
  return color.replace(tokenPattern, (match, name: string) => {
    const fallback = lightTheme[name]
    return fallback === undefined ? match : `var(--graph-${name}, ${fallback})`
  })
}

export class ThemeResolver {
  readonly #host: HTMLElement
  readonly #probe: HTMLElement
  readonly #context: CanvasRenderingContext2D | null

  constructor(host: HTMLElement) {
    this.#host = host
    this.#probe = document.createElement('span')
    this.#probe.setAttribute('aria-hidden', 'true')
    this.#probe.style.cssText =
      'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'
    host.append(this.#probe)
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    this.#context = canvas.getContext('2d', { willReadFrequently: true })
  }

  color(css: string): Rgba {
    const probe = this.#probe
    probe.style.color = ''
    probe.style.color = withFallbacks(css)
    const computed = getComputedStyle(probe).color
    const context = this.#context
    if (!context) return [0, 0, 0, 255]
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = '#000'
    context.fillStyle = computed
    context.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
    return [r, g, b, a]
  }

  palette(colors: readonly string[], target: Uint8Array, from = 0): void {
    for (let id = from; id < colors.length; id++) target.set(this.color(colors[id] ?? ''), id * 4)
  }

  theme(): ResolvedTheme {
    const font = getComputedStyle(this.#host).getPropertyValue('--graph-font').trim()
    return {
      labelInk: this.color(themeColor('ink')),
      labelMuted: this.color(themeColor('ink-muted')),
      labelHalo: this.color(themeColor('label-halo')),
      halo: this.color(themeColor('halo')),
      lensFill: this.color(themeColor('lens-fill')),
      lensRing: this.color(themeColor('lens-ring')),
      lensShadow: this.color(themeColor('lens-shadow')),
      font: font === '' ? defaultFont : font,
    }
  }

  destroy(): void {
    this.#probe.remove()
  }
}

export function observeTheme(host: HTMLElement, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  const attributes = ['class', 'style', 'data-theme']
  for (const element of [document.documentElement, document.body, host]) {
    if (element) observer.observe(element, { attributes: true, attributeFilter: attributes })
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    media.removeEventListener('change', onChange)
  }
}
