import type { TextWidths } from '../dom/text-width'
import type { ColorSource, FrameClock } from '../host/environment'
import type { FlowWatch } from '../host/flows'
import { FrameCost } from '../host/frame-cost'
import type { HostPage, HostParts, PagePointer, PageRender } from '../host/graph-core'
import type {
  GraphSize,
  HostSurface,
  RendererFactory,
  SurfaceCapabilities,
} from '../host/graph-instance'
import { coreAfterDestroy, nothing } from '../host/lifecycle'
import type { PointerTool } from '../host/pointer-tool'

export const noneCapabilities: SurfaceCapabilities = Object.freeze({
  name: 'none',
  ownCanvas: false,
  ownCamera: true,
  viewGestures: false,
  layouts: true,
  lens: false,
  minimap: false,
  onMap: false,
  screenPadding: false,
  groupFillOpacity: null,
})

export const defaultSize: GraphSize = Object.freeze({ width: 1024, height: 768 })

export function checkSize(size: GraphSize): GraphSize {
  const { width, height } = size
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) {
    throw new RangeError('graph: size takes a finite width and height above 0')
  }
  return { width, height }
}

export interface TimerClock extends FrameClock {
  clear(): void
}

export function timerClock(delay: number): TimerClock {
  const timers = new Map<number, ReturnType<typeof setTimeout>>()
  let next = 0
  return {
    request(frame) {
      const id = ++next
      const timer = setTimeout(() => {
        timers.delete(id)
        frame(performance.now())
      }, delay)
      timers.set(id, timer)
      return id
    },
    cancel(request) {
      clearTimeout(timers.get(request))
      timers.delete(request)
    },
    clear() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}

export function noneSurface(): HostSurface {
  const clock = timerClock(0)
  return {
    ...noneCapabilities,
    events: null as unknown as HTMLCanvasElement,
    place: nothing,
    unplace: nothing,
    camera: () => null,
    schedule: clock.request,
    cancel: clock.cancel,
    claim: nothing,
    hover: nothing,
    move: nothing,
    adapt: (definition) => definition,
    bind: nothing,
    release: clock.clear,
  }
}

const noRenderer: RendererFactory = () => {
  throw new Error('graph: a graph made by createGraph draws nothing')
}

const stillFlows: FlowWatch = Object.freeze({
  time: () => 0,
  moving: () => false,
  destroy: nothing,
})

class StillRender implements PageRender {
  readonly renderer = null
  readonly contextLost = false
  readonly drawable = false
  readonly cost: FrameCost = new FrameCost(() => null)
  full = true
  settled = false
  positionsVersion = -1
  pixelRatio = 1
  software: boolean | null = null
  flowTime = 0
  readonly #parts: HostParts
  readonly #colors: ColorSource
  readonly #textWidths: TextWidths

  constructor(parts: HostParts, colors: ColorSource, textWidths: TextWidths) {
    this.#parts = parts
    this.#colors = colors
    this.#textWidths = textWidths
  }

  ratioFor(): number {
    return 1
  }

  resize(width: number, height: number): void {
    this.#parts.patch({ width, height })
    this.#parts.reconstrain()
    this.#parts.request()
  }

  refreshTheme(): void {
    const { scene, palette } = this.#parts
    if (this.#textWidths.setFont(this.#colors.theme().font) && scene.remeasure()) {
      this.#parts.remeasured()
    }
    palette.resolve(true)
    this.#parts.request()
  }

  drawn(): void {}
  attach(): void {}
  detach(): void {}
  listen(): void {}
  enter(): void {}
  refreshRatio(): void {}
  unwatch(): void {}
  release(): void {}
}

function stillPointer(): PagePointer {
  let tool: PointerTool | null = null
  return {
    hasDrag: () => false,
    dragging: () => undefined,
    redrawLasso: nothing,
    hover: nothing,
    dropLostDrag: nothing,
    updateCursor: nothing,
    autoPanning: false,
    stepAutoPan: nothing,
    abandon: nothing,
    listen: nothing,
    unlisten: nothing,
    get tool() {
      return tool
    },
    setTool: (next) => {
      tool = next
    },
    stopMoves: nothing,
  }
}

export function headlessPage(
  title: string | null,
  size: GraphSize,
  colors: ColorSource,
  textWidths: TextWidths,
): HostPage {
  let shown = size
  let render: StillRender | null = null
  return {
    createRenderer: noRenderer,
    place: nothing,
    unplace: nothing,
    open(parts) {
      const still = new StillRender(parts, colors, textWidths)
      render = still
      return {
        render: still,
        pointer: stillPointer(),
        focus: { set: nothing, applyKeyboard: nothing },
        lens: { shown: null, wanted: null, update: nothing },
        anchors: {
          anchors: { set: () => nothing, remove: nothing },
          place: nothing,
          destroy: nothing,
        },
        waiters: { drawn: nothing, reject: nothing },
        api: {},
        start() {
          still.resize(shown.width, shown.height)
          return stillFlows
        },
      }
    },
    focused: () => false,
    focus: nothing,
    measure: () => shown,
    unlisten: nothing,
    remove: nothing,
    update(next) {
      if (next.size === undefined) return
      shown = checkSize(next.size)
      render?.resize(shown.width, shown.height)
    },
    dead: (store, signal, reason, shaped) => coreAfterDestroy(store, signal, reason, shaped),
    title: () => title,
  }
}
