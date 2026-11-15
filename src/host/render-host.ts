import { defaultPointBudget, type EdgePaths } from '../core/edge-paths'
import type { LoadedFamilies } from '../core/font-family'
import type { Scene } from '../core/scene'
import { dev } from '../dev'
import { watchFonts } from '../dom/fonts'
import type { TextWidths } from '../dom/text-width'
import { observeTheme, type ThemeResolver, type ThemeWatch } from '../dom/theme'
import { FrameCost } from './frame-cost'
import type { GraphState, HostSurface, RendererFactory } from './graph-instance'
import type { Renderer } from './renderer'

export interface RenderSource {
  surface(): HostSurface
  readonly createRenderer: RendererFactory
  readonly scene: Scene
  readonly themeResolver: ThemeResolver
  readonly textWidths: TextWidths
  paths(): EdgePaths
  state(): GraphState
  patch(next: Partial<GraphState>): void
  remeasured(): void
  reconstrain(): void
  drawNow(): void
  request(): void
  destroyed(): boolean
}

export class RenderHost {
  full = true
  settled = false
  positionsVersion = -1
  pixelRatio: number = window.devicePixelRatio || 1
  flowTime = 0
  paletteColors: Uint8Array = new Uint8Array(256 * 4)
  paletteVersion = 0
  paletteStamp = 0
  readonly cost: FrameCost = new FrameCost(() => this.renderer)
  #paletteCount = 0
  #drawingLimit = Number.POSITIVE_INFINITY
  #ratioLimit = Number.POSITIVE_INFINITY
  #warnedEmpty = false
  #ratioQuery: MediaQueryList | null = null
  #themeWatch: ThemeWatch | null = null
  #resizeObserver: ResizeObserver | null = null
  #fontWatch: (() => void) | null = null
  #listened: HTMLCanvasElement | null = null
  readonly #renderers = new Map<HostSurface, Renderer>()
  readonly #lost = new Set<HostSurface>()
  #own: HostSurface | null = null
  readonly #source: RenderSource

  constructor(source: RenderSource) {
    this.#source = source
    const surface = source.surface()
    if (surface.ownCanvas) {
      this.#renderers.set(
        surface,
        source.createRenderer(surface.events, () => source.request()),
      )
    }
  }

  get renderer(): Renderer | null {
    return this.#renderers.get(this.#source.surface()) ?? null
  }

  get contextLost(): boolean {
    return this.#lost.has(this.#source.surface())
  }

  resolvePalette(all: boolean): void {
    const { scene, themeResolver } = this.#source
    const palette = scene.palette
    const colors = palette.colors
    if (colors.length * 4 > this.paletteColors.length) {
      const next = new Uint8Array(Math.max(colors.length * 4, this.paletteColors.length * 2))
      next.set(this.paletteColors)
      this.paletteColors = next
    }
    const paletteColors = this.paletteColors
    if (all) themeResolver.palette(colors, paletteColors)
    else {
      palette.changed(this.paletteVersion, (id, color) => {
        paletteColors.set(themeResolver.color(color), id * 4)
      })
    }
    this.paletteVersion = palette.version
    this.#paletteCount = colors.length
    this.paletteStamp++
    this.renderer?.setPalette(paletteColors, this.#paletteCount)
  }

  adoptLimits(): void {
    const limits = this.renderer?.limits?.()
    this.#source.paths().pointBudget = Math.min(
      defaultPointBudget,
      limits?.pathPoints ?? defaultPointBudget,
    )
    this.#drawingLimit = limits?.drawingBuffer ?? Number.POSITIVE_INFINITY
    this.#ratioLimit = limits?.software ? 1 : Number.POSITIVE_INFINITY
  }

  readonly refreshTheme = (): void => {
    const { scene, themeResolver, textWidths } = this.#source
    const theme = themeResolver.theme()
    this.renderer?.setTheme(theme)
    if (textWidths.setFont(theme.font) && scene.remeasure()) this.#source.remeasured()
    this.resolvePalette(true)
    this.#source.request()
  }

  resize(width: number, height: number, drawNow = true): void {
    const surface = this.#source.surface()
    let cleared = false
    if (surface.ownCanvas) {
      const canvas = surface.events
      const side = Math.max(width, height, 1)
      this.pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        this.#ratioLimit,
        this.#drawingLimit / side,
      )
      const across = Math.min(this.#drawingLimit, Math.max(1, Math.round(width * this.pixelRatio)))
      const down = Math.min(this.#drawingLimit, Math.max(1, Math.round(height * this.pixelRatio)))
      cleared = canvas.width !== across || canvas.height !== down
      if (canvas.width !== across) canvas.width = across
      if (canvas.height !== down) canvas.height = down
    }
    if (dev && !this.#warnedEmpty && (width === 0 || height === 0)) {
      this.#warnedEmpty = true
      console.warn('graph: the container measures 0 px; give it a width and a height')
    }
    this.#source.patch({ width, height })
    this.#source.reconstrain()
    if (cleared && drawNow && this.settled && this.renderer) {
      this.#source.drawNow()
      return
    }
    this.#source.request()
  }

  watch(element: HTMLElement): void {
    const themeWatch = observeTheme(element, this.refreshTheme)
    this.#themeWatch = themeWatch
    this.#resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      themeWatch.check()
      if (entry) this.resize(entry.contentRect.width, entry.contentRect.height)
    })
    this.#source.reconstrain()
    this.#resizeObserver.observe(element)
    this.#watchRatio()
    this.#fontWatch = watchFonts(this.#onFonts)
  }

  readonly #onFonts = (families: LoadedFamilies): void => {
    const source = this.#source
    if (source.destroyed()) return
    const measured = source.textWidths.reload(families)
    const drawn = this.renderer?.reloadFonts?.(families) ?? false
    if (measured && source.scene.remeasure()) source.remeasured()
    if (measured || drawn) source.request()
  }

  #watchRatio(): void {
    this.#ratioQuery?.removeEventListener('change', this.#onRatio)
    const ratio = window.devicePixelRatio || 1
    this.#ratioQuery = this.#source.surface().ownCanvas
      ? (window.matchMedia?.(`(resolution: ${ratio}dppx)`) ?? null)
      : null
    this.#ratioQuery?.addEventListener('change', this.#onRatio)
  }

  readonly #onRatio = (): void => {
    this.#watchRatio()
    const { width, height } = this.#source.state()
    this.resize(width, height)
  }

  readonly onContextLost = (event: Event): void => {
    event.preventDefault()
    const own = this.#own
    if (!own) return
    this.#lost.add(own)
    this.#renderers.get(own)?.destroy()
    this.#renderers.delete(own)
  }

  readonly onContextRestored = (): void => {
    const source = this.#source
    const own = this.#own
    if (source.destroyed() || !own) return
    this.#lost.delete(own)
    if (source.surface() !== own) return
    if (!this.#create(own)) {
      this.#lost.add(own)
      return
    }
    this.full = true
    this.adoptLimits()
    this.refreshTheme()
    const { width, height } = source.state()
    this.resize(width, height)
  }

  #create(surface: HostSurface): boolean {
    const source = this.#source
    try {
      this.#renderers.set(
        surface,
        source.createRenderer(surface.events, () => source.request()),
      )
      return true
    } catch (error) {
      if (dev) console.warn('graph: cannot restore the WebGL context', error)
      return false
    }
  }

  listen(surface: HostSurface): void {
    if (!surface.ownCanvas || this.#listened) return
    const canvas = surface.events
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.#listened = canvas
    this.#own = surface
  }

  unlisten(): void {
    const canvas = this.#listened
    if (!canvas) return
    this.#listened = null
    canvas.removeEventListener('webglcontextlost', this.onContextLost)
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
  }

  enter(surface: HostSurface): void {
    if (surface.ownCanvas && !this.#renderers.has(surface) && !this.#lost.has(surface)) {
      if (!this.#create(surface)) this.#lost.add(surface)
    }
    this.full = true
    this.positionsVersion = -1
    this.cost.reset()
    this.#themeWatch?.check()
    this.adoptLimits()
    this.refreshTheme()
    this.#watchRatio()
  }

  attach(surface: HostSurface, create: (invalidate: () => void) => Renderer): void {
    this.#renderers.get(surface)?.destroy()
    this.#renderers.set(
      surface,
      create(() => this.#source.request()),
    )
    if (surface !== this.#source.surface()) return
    this.full = true
    this.adoptLimits()
    this.refreshTheme()
  }

  detach(surface: HostSurface): void {
    this.#renderers.get(surface)?.destroy()
    this.#renderers.delete(surface)
    if (surface === this.#source.surface()) this.full = true
  }

  unwatch(): void {
    this.cost.stop()
    this.#resizeObserver?.disconnect()
    this.#ratioQuery?.removeEventListener('change', this.#onRatio)
    this.#themeWatch?.stop()
    this.#fontWatch?.()
    this.#fontWatch = null
  }

  release(): void {
    this.cost.stop()
    for (const renderer of this.#renderers.values()) renderer.destroy()
    this.#renderers.clear()
  }
}
