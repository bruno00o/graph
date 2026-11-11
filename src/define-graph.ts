import { maxLayerSlots } from './core/mark-layers'
import { shapeEngineOf } from './core/shape-engine'
import { byKind, freeStateNames, maxFreeStates } from './core/state-names'
import { resolvePadding } from './core/view'
import { withoutUndefined } from './core/without-undefined'
import { themeColor } from './theme/tokens'
import type {
  AutoFit,
  BackgroundOptions,
  BridgeOptions,
  FitPadding,
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  LensOptions,
  Mark,
  ResolvedBackground,
  ResolvedBridges,
  ResolvedInteraction,
  ResolvedLens,
  ResolvedPadding,
  ResolvedSupportStates,
  ResolvedTimeOptions,
  ResolvedTransitions,
  ResolvedViewLimits,
  StateKindStyles,
  StateStyle,
  StateStyles,
  SupportStateOptions,
  TimeOptions,
  TransitionOptions,
  ViewBounds,
  ViewLimitOptions,
  WheelMode,
} from './types'

const defaultZoomSpeed = 1
const defaultAutoPanSpeed = 1
const defaultMinZoom = 1e-3
const defaultMaxZoom = 64
const wheelModes: readonly WheelMode[] = ['zoom', 'pan', 'page']
const autoFits: readonly AutoFit[] = ['first', 'layouts', 'never']
const defaultPadding = 32
export const defaultViewPadding: ResolvedPadding = Object.freeze({
  top: defaultPadding,
  right: defaultPadding,
  bottom: defaultPadding,
  left: defaultPadding,
})
const defaultPositionTransition = 120
const defaultLayoutTransition = 400
const defaultGridSpacing = 16
const defaultLensRadius = 120
const defaultLensZoom = 3
const defaultLensKey = 'Alt'
const defaultBridgeSize = 8
const defaultBridgeEdges = 100_000
const defaultDataWait = 10_000

function atLeastZero(value: number, name: string): number {
  if (!(value >= 0) || !Number.isFinite(value)) {
    throw new RangeError(`defineGraph: ${name} must be a finite number, 0 or more`)
  }
  return value
}

function positive(value: number, name: string): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`defineGraph: ${name} must be a positive number`)
  }
  return value
}

function resolveWait(option: boolean | number | undefined): number {
  if (option === undefined) return defaultDataWait
  if (option === true) return Number.POSITIVE_INFINITY
  if (option === false) return 0
  if (option === Number.POSITIVE_INFINITY) return option
  return atLeastZero(option, 'waitForData')
}

function resolveSpeed(
  option: boolean | { readonly speed?: number | undefined },
  fallback: number,
  name: string,
): false | { readonly speed: number } {
  if (option === false) return false
  const speed = (option === true ? undefined : option.speed) ?? fallback
  return Object.freeze({ speed: atLeastZero(speed, `interaction.${name}.speed`) })
}

function resolveInteraction(options: InteractionOptions = {}): ResolvedInteraction {
  const wheel = options.wheel ?? 'zoom'
  if (!wheelModes.includes(wheel)) {
    throw new TypeError("defineGraph: interaction.wheel must be 'zoom', 'pan' or 'page'")
  }
  return Object.freeze({
    pan: options.pan ?? true,
    zoom: resolveSpeed(options.zoom ?? true, defaultZoomSpeed, 'zoom'),
    wheel,
    autoPan: resolveSpeed(options.autoPan ?? true, defaultAutoPanSpeed, 'autoPan'),
    select: options.select ?? 'multiple',
    drag: options.drag ?? true,
    lasso: options.lasso ?? false,
    keyboard: options.keyboard ?? true,
    fold: options.fold ?? true,
    lens: resolveLens(options.lens ?? false),
  })
}

function resolveLens(options: boolean | LensOptions): ResolvedLens {
  const given = typeof options === 'object' ? options : {}
  const radius = given.radius ?? defaultLensRadius
  const zoom = given.zoom ?? defaultLensZoom
  if (!(radius > 0) || !Number.isFinite(radius)) {
    throw new RangeError('defineGraph: interaction.lens.radius must be a positive number')
  }
  if (!(zoom >= 1) || !Number.isFinite(zoom)) {
    throw new RangeError('defineGraph: interaction.lens.zoom must be a number of at least 1')
  }
  const key = options === false ? null : given.key === undefined ? defaultLensKey : given.key
  return Object.freeze({ radius, zoom, key })
}

function resolveBounds(bounds: ViewBounds | null): ViewBounds | null {
  if (bounds === null) return null
  if ('margin' in bounds) {
    if (!Number.isFinite(bounds.margin)) {
      throw new RangeError('defineGraph: view.bounds.margin must be a finite number')
    }
    return Object.freeze({ margin: bounds.margin })
  }
  const { minX, minY, maxX, maxY } = bounds
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || minX > maxX || minY > maxY) {
    throw new RangeError('defineGraph: view.bounds must be finite and not inverted')
  }
  return Object.freeze({ minX, minY, maxX, maxY })
}

function resolveViewPadding(padding: number | FitPadding | undefined): ResolvedPadding {
  const sides =
    padding === undefined || typeof padding === 'number'
      ? [padding]
      : [padding.top, padding.right, padding.bottom, padding.left]
  if (!sides.every((side) => side === undefined || Number.isFinite(side))) {
    throw new RangeError('defineGraph: view.padding must be finite numbers')
  }
  return Object.freeze({ ...resolvePadding(padding, defaultViewPadding) })
}

function resolveView(options: ViewLimitOptions = {}): ResolvedViewLimits {
  const minZoom = options.minZoom ?? defaultMinZoom
  const maxZoom = options.maxZoom ?? defaultMaxZoom
  if (!(minZoom > 0) || !Number.isFinite(maxZoom) || !(minZoom <= maxZoom)) {
    throw new RangeError('defineGraph: view zoom limits must be positive, with minZoom ≤ maxZoom')
  }
  const autoFit = options.autoFit ?? 'first'
  if (!autoFits.includes(autoFit)) {
    throw new TypeError("defineGraph: view.autoFit must be 'first', 'layouts' or 'never'")
  }
  return Object.freeze({
    minZoom,
    maxZoom,
    bounds: resolveBounds(options.bounds ?? null),
    padding: resolveViewPadding(options.padding),
    autoFit,
  })
}

function resolveBackground(
  options: BackgroundOptions | null | undefined,
): ResolvedBackground | null {
  if (!options) return null
  if (options.grid !== 'lines' && options.grid !== 'dots') {
    throw new TypeError("defineGraph: background.grid must be 'lines' or 'dots'")
  }
  return Object.freeze({
    grid: options.grid,
    spacing: positive(options.spacing ?? defaultGridSpacing, 'background.spacing'),
    color: options.color ?? themeColor('grid'),
    majorColor: options.majorColor ?? themeColor('grid-major'),
    adaptive: options.adaptive !== false,
  })
}

function resolveBridges(
  options: BridgeOptions | boolean | null | undefined,
): ResolvedBridges | null {
  if (!options) return null
  const given = options === true ? {} : options
  const shape = given.shape ?? 'arc'
  if (shape !== 'arc' && shape !== 'gap') {
    throw new TypeError("defineGraph: bridges.shape must be 'arc' or 'gap'")
  }
  const maxEdges = given.maxEdges ?? defaultBridgeEdges
  if (!(maxEdges >= 0)) throw new RangeError('defineGraph: bridges.maxEdges must be 0 or more')
  return Object.freeze({
    shape,
    size: positive(given.size ?? defaultBridgeSize, 'bridges.size'),
    maxEdges: Math.floor(Math.min(maxEdges, 2 ** 31)),
  })
}

function resolveTime(options: TimeOptions = {}): ResolvedTimeOptions {
  return Object.freeze({ fade: atLeastZero(options.fade ?? 0, 'time.fade') })
}

function resolveTransitions(options: TransitionOptions = {}): ResolvedTransitions {
  return Object.freeze({
    positions: atLeastZero(options.positions ?? defaultPositionTransition, 'transitions.positions'),
    layout: atLeastZero(options.layout ?? defaultLayoutTransition, 'transitions.layout'),
  })
}

function checkLayers(marks: readonly Mark[]): void {
  const slots = { nodes: 0, edges: 0, shapes: 0 }
  for (const mark of marks) {
    const slot = slots[mark.type]++
    const layer = (mark as { readonly layer?: unknown }).layer
    if (layer === undefined) continue
    if (typeof layer !== 'string' || layer === '') {
      throw new TypeError('defineGraph: a layer must be a non-empty string')
    }
    if (slot >= maxLayerSlots) {
      throw new RangeError(
        `defineGraph: only the first ${maxLayerSlots} node marks and edge marks can join a layer`,
      )
    }
  }
}

function resolveSupport(
  options: SupportStateOptions | null | undefined,
  states: readonly string[],
): ResolvedSupportStates | null {
  if (!options) return null
  const name = (value: string | null | undefined): string | null => {
    if (value === undefined || value === null) return null
    if (!states.includes(value)) {
      throw new TypeError(`defineGraph: support state "${value}" must be a free state of states`)
    }
    return value
  }
  const carriers = name(options.carriers)
  const carried = name(options.carried)
  return carriers === null && carried === null ? null : Object.freeze({ carriers, carried })
}

function freezeStyle(style: StateStyle | undefined): StateStyle {
  const own = withoutUndefined(style ?? {})
  const others = style?.others
  return Object.freeze(others ? { ...own, others: Object.freeze(withoutUndefined(others)) } : own)
}

function freezeStates<S extends string>(states: StateStyles<S>): StateStyles<S> {
  const frozen: Record<string, StateStyle | StateKindStyles> = {}
  for (const name of Object.keys(states)) {
    const style = (states as Record<string, StateStyle | StateKindStyles | undefined>)[name]
    if (style && byKind(style)) {
      const kinds: { nodes?: StateStyle; edges?: StateStyle } = {}
      if (style.nodes) kinds.nodes = freezeStyle(style.nodes)
      if (style.edges) kinds.edges = freezeStyle(style.edges)
      frozen[name] = Object.freeze(kinds)
    } else {
      frozen[name] = freezeStyle(style)
    }
  }
  return Object.freeze(frozen) as StateStyles<S>
}

/**
 * Builds a frozen graph definition from marks, scales, states and options. The names of `states`
 * become the state names accepted by the instance, and the item types and names of the marks type
 * the targets of its events and state.
 */
export function defineGraph<S extends string = never, M extends Mark = never>(
  options: GraphDefinitionOptions<S, M>,
): GraphDefinition<S, M> {
  for (const mark of options.marks) {
    if (mark?.type === 'shapes') {
      if (!shapeEngineOf(mark)) {
        throw new TypeError('defineGraph: every shape mark must come from shapes()')
      }
    } else if (mark?.type !== 'nodes' && mark?.type !== 'edges') {
      throw new TypeError('defineGraph: every mark must come from nodes(), edges() or shapes()')
    }
  }
  for (const hull of options.hulls ?? []) {
    if (hull?.type !== 'hull') throw new TypeError('defineGraph: every hull must come from hull()')
  }
  const bundling = options.bundling ?? null
  if (bundling !== null && typeof bundling.start !== 'function') {
    throw new TypeError('defineGraph: bundling must have a start function')
  }
  const routing = options.routing ?? null
  if (routing !== null && typeof routing.start !== 'function') {
    throw new TypeError('defineGraph: routing must have a start function')
  }
  if (routing !== null && bundling !== null) {
    throw new TypeError('defineGraph: use bundling or routing, not both')
  }
  checkLayers(options.marks)
  const states = freezeStates(options.states ?? ({} as StateStyles<S>))
  const free = freeStateNames(states)
  if (free.length > maxFreeStates) {
    throw new RangeError(
      `defineGraph: at most ${maxFreeStates} states besides selected, hovered and focused`,
    )
  }
  return Object.freeze({
    marks: Object.freeze([...options.marks]),
    scales: Object.freeze(withoutUndefined(options.scales ?? {})),
    states,
    layout: options.layout ?? null,
    relayout: options.relayout ?? false,
    waitForData: resolveWait(options.waitForData),
    interaction: resolveInteraction(options.interaction),
    view: resolveView(options.view),
    transitions: resolveTransitions(options.transitions),
    background: resolveBackground(options.background),
    hulls: Object.freeze([...(options.hulls ?? [])]),
    bundling,
    routing,
    bridges: resolveBridges(options.bridges),
    time: resolveTime(options.time),
    support: resolveSupport(options.support as SupportStateOptions | null | undefined, free),
  })
}
