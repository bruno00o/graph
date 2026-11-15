import { defaultPointBudget, type EdgePaths } from '../core/edge-paths'
import type { LoadedFamilies } from '../core/font-family'
import type { Scene } from '../core/scene'
import { dev } from '../dev'
import { watchFonts } from '../dom/fonts'
import type { TextWidths } from '../dom/text-width'
import { observeTheme, type ResolvedTheme, type ThemeResolver, type ThemeWatch } from '../dom/theme'
import { FrameCost } from './frame-cost'
import type { GraphState, HostSurface, RendererFactory } from './graph-instance'
import { KeptFrame } from './kept-frame'
import type { Renderer, RendererContext } from './renderer'

type Given = 'none' | 'losing' | 'lost' | 'restoring'

const restoreWait = 2000

function sameTheme(a: ResolvedTheme | null, b: ResolvedTheme): boolean {
  if (!a || a.font !== b.font) return false
  const keys = Object.keys(b) as (keyof ResolvedTheme)[]
  return keys.every((key) => key === 'font' || String(a[key]) === String(b[key]))
}

function samePalette(kept: Uint8Array, colors: Uint8Array): boolean {
  for (let at = 0; at < kept.length; at++) if (kept[at] !== colors[at]) return false
  return true
}

export interface RenderSource {
  surface(): HostSurface
  readonly createRenderer: RendererFactory
  readonly scene: Scene
  readonly themeResolver: ThemeResolver
  readonly textWidths: TextWidths
  paths(): EdgePaths
  economy(): boolean | 'auto'
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
  #software: boolean | null = null
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
  #suspended: boolean
  #keep: boolean
  #given: Given = 'none'
  #asked = 0
  #context: RendererContext | null = null
  #wake: ReturnType<typeof setTimeout> | undefined
  #hidden = false
  #releasing = false
  #theme: ResolvedTheme | null = null
  readonly #kept = new KeptFrame()

  constructor(source: RenderSource, suspended = false, keepFrame = true) {
    this.#source = source
    this.#suspended = suspended
    this.#keep = keepFrame
    const surface = source.surface()
    if (surface.ownCanvas && !suspended) {
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
    return !this.#suspended && this.#lost.has(this.#source.surface())
  }

  get suspended(): boolean {
    return this.#suspended
  }

  get keepsFrame(): boolean {
    return this.#keep
  }

  set keepsFrame(keep: boolean) {
    this.#keep = keep
    if (!keep) this.#kept.drop()
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
    this.#software = limits ? limits.software : null
    this.#ratioLimit = this.economical ? 1 : Number.POSITIVE_INFINITY
  }

  get software(): boolean | null {
    return this.#software
  }

  get economical(): boolean {
    if (!this.#source.surface().ownCanvas) return false
    const economy = this.#source.economy()
    return economy === 'auto' ? this.#software === true : economy
  }

  refreshEconomy(): void {
    const limit = this.economical ? 1 : Number.POSITIVE_INFINITY
    if (limit === this.#ratioLimit) return
    this.#ratioLimit = limit
    const { width, height } = this.#source.state()
    if (width > 0 || height > 0) this.resize(width, height)
  }

  readonly refreshTheme = (): void => {
    const { scene, themeResolver, textWidths } = this.#source
    const theme = themeResolver.theme()
    const previous = this.#theme
    const kept = this.#kept.held ? this.paletteColors.slice(0, this.#paletteCount * 4) : null
    this.#theme = theme
    this.renderer?.setTheme(theme)
    if (textWidths.setFont(theme.font) && scene.remeasure()) this.#source.remeasured()
    this.resolvePalette(true)
    if (kept && !(sameTheme(previous, theme) && samePalette(kept, this.paletteColors))) {
      this.#kept.drop()
    }
    this.#source.request()
  }

  suspend(): boolean {
    if (this.#suspended) return false
    this.#suspended = true
    const own = this.#own
    if (!own) return false
    if (this.#keep && this.#source.surface() === own && this.#renderers.has(own)) {
      this.#releasing = true
      return true
    }
    this.#hide(own)
    const renderer = this.#renderers.get(own)
    if (renderer) this.#release(own, renderer)
    return false
  }

  resume(): void {
    if (!this.#suspended) return
    this.#suspended = false
    if (this.#releasing) {
      this.#releasing = false
      return
    }
    const own = this.#own
    if (own && this.#source.surface() === own && this.#acquire(own)) this.#ready()
    this.#source.request()
  }

  recover(): void {
    const own = this.#own
    if (this.#suspended || !own || !this.#lost.has(own) || this.#source.surface() !== own) return
    if (this.#acquire(own)) this.#ready()
    this.#source.request()
  }

  drawn(now: number): void {
    this.cost.drawn(now)
    const own = this.#own
    if (!own || this.#source.surface() !== own) return
    if (this.#hidden && !this.#suspended) {
      this.#hidden = false
      own.events.style.visibility = ''
      this.#kept.drop()
    }
    if (this.#releasing) this.#finish(own, true)
  }

  released(): void {
    const own = this.#own
    if (this.#releasing && own) this.#finish(own, false)
  }

  #finish(own: HostSurface, capture: boolean): void {
    this.#releasing = false
    const renderer = this.#renderers.get(own)
    if (capture && this.#keep && renderer) {
      const { width, height } = this.#source.state()
      this.#kept.capture(own.events, width, height)
    }
    this.#hide(own)
    if (renderer) this.#release(own, renderer)
  }

  #hide(own: HostSurface): void {
    this.#hidden = true
    own.events.style.visibility = 'hidden'
  }

  #release(own: HostSurface, renderer: Renderer): void {
    this.#renderers.delete(own)
    let context: RendererContext | null = null
    if (renderer.suspend) context = renderer.suspend()
    else renderer.destroy()
    this.#context = context
    this.#given = context ? 'losing' : 'none'
  }

  #acquire(own: HostSurface): boolean {
    if (this.#renderers.has(own)) return false
    if (this.#lost.has(own)) return this.#retrieve(own)
    const given = this.#given
    if (given === 'losing' || given === 'restoring') return false
    if (given === 'lost' && this.#context) {
      this.#given = 'restoring'
      this.#context.restore()
      return false
    }
    this.#given = 'none'
    if (this.#create(own)) return true
    this.#lost.add(own)
    return false
  }

  #retrieve(own: HostSurface): boolean {
    const now = performance.now()
    if (this.#given === 'restoring' && now - this.#asked < restoreWait) return false
    const context = this.#context
    if (context?.lost()) {
      this.#given = 'restoring'
      this.#asked = now
      context.restore()
      return false
    }
    if (!context) return false
    this.#lost.delete(own)
    this.#given = 'none'
    if (this.#create(own)) return true
    this.#lost.add(own)
    return false
  }

  #ready(): void {
    this.full = true
    this.positionsVersion = -1
    this.cost.reset()
    this.adoptLimits()
    this.refreshTheme()
    const { width, height } = this.#source.state()
    this.resize(width, height)
  }

  #wakeLater(): void {
    clearTimeout(this.#wake)
    this.#wake = setTimeout(() => {
      this.#wake = undefined
      const own = this.#own
      if (this.#source.destroyed() || this.#suspended || !own) return
      if (this.#source.surface() === own && this.#acquire(own)) this.#ready()
    })
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
    this.#kept.place(width, height)
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
    if (this.#given === 'losing') {
      this.#given = 'lost'
      if (!this.#suspended) this.#wakeLater()
      return
    }
    this.#lost.add(own)
    this.#hide(own)
    const renderer = this.#renderers.get(own)
    this.#renderers.delete(own)
    if (!renderer) return
    if (renderer.suspend) this.#context = renderer.suspend()
    else renderer.destroy()
  }

  readonly onContextRestored = (): void => {
    const source = this.#source
    const own = this.#own
    if (source.destroyed() || !own) return
    this.#lost.delete(own)
    if (this.#given === 'restoring') this.#given = 'none'
    if (this.#suspended) {
      this.#giveBack(own)
      return
    }
    if (source.surface() !== own) return
    if (!this.#create(own)) {
      this.#lost.add(own)
      return
    }
    this.#ready()
  }

  #giveBack(own: HostSurface): void {
    if (this.#context) {
      this.#given = 'losing'
      this.#context.lose()
      return
    }
    if (!this.#create(own)) return
    const renderer = this.#renderers.get(own)
    if (renderer) this.#release(own, renderer)
  }

  #create(surface: HostSurface): boolean {
    const source = this.#source
    try {
      this.#renderers.get(surface)?.destroy()
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
    if (this.#suspended) this.#hide(surface)
  }

  unlisten(): void {
    const canvas = this.#listened
    if (!canvas) return
    this.#listened = null
    canvas.removeEventListener('webglcontextlost', this.onContextLost)
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
  }

  enter(surface: HostSurface): void {
    if (surface.ownCanvas && !this.#suspended) this.#acquire(surface)
    if (!surface.ownCanvas) this.#kept.drop()
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
    clearTimeout(this.#wake)
    this.#wake = undefined
    this.#kept.drop()
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
