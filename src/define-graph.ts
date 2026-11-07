import { freeStateNames, maxFreeStates } from './core/state-names'
import { themeColor } from './theme/tokens'
import type {
  BackgroundOptions,
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  LensOptions,
  Mark,
  ResolvedBackground,
  ResolvedInteraction,
  ResolvedLens,
  ResolvedViewLimits,
  StateStyles,
  ViewBounds,
  ViewLimitOptions,
  WheelMode,
} from './types'

const defaultZoomSpeed = 1
const defaultAutoPanSpeed = 1
const defaultMinZoom = 1e-3
const defaultMaxZoom = 64
const wheelModes: readonly WheelMode[] = ['zoom', 'pan', 'page']
const defaultPositionTransition = 120
const defaultLayoutTransition = 400
const defaultGridSpacing = 16
const defaultLensRadius = 120
const defaultLensZoom = 3
const defaultLensKey = 'Alt'

function resolveSpeed(
  option: boolean | { readonly speed?: number },
  fallback: number,
): false | { readonly speed: number } {
  if (option === false) return false
  return Object.freeze({ speed: (option === true ? undefined : option.speed) ?? fallback })
}

function resolveInteraction(options: InteractionOptions = {}): ResolvedInteraction {
  const wheel = options.wheel ?? 'zoom'
  if (!wheelModes.includes(wheel)) {
    throw new TypeError("defineGraph: interaction.wheel must be 'zoom', 'pan' or 'page'")
  }
  return Object.freeze({
    pan: options.pan ?? true,
    zoom: resolveSpeed(options.zoom ?? true, defaultZoomSpeed),
    wheel,
    autoPan: resolveSpeed(options.autoPan ?? true, defaultAutoPanSpeed),
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

function resolveView(options: ViewLimitOptions = {}): ResolvedViewLimits {
  const minZoom = options.minZoom ?? defaultMinZoom
  const maxZoom = options.maxZoom ?? defaultMaxZoom
  if (!(minZoom > 0) || !Number.isFinite(maxZoom) || !(minZoom <= maxZoom)) {
    throw new RangeError('defineGraph: view zoom limits must be positive, with minZoom ≤ maxZoom')
  }
  return Object.freeze({ minZoom, maxZoom, bounds: resolveBounds(options.bounds ?? null) })
}

function resolveBackground(
  options: BackgroundOptions | null | undefined,
): ResolvedBackground | null {
  if (!options) return null
  if (options.grid !== 'lines' && options.grid !== 'dots') {
    throw new TypeError("defineGraph: background.grid must be 'lines' or 'dots'")
  }
  const spacing = options.spacing ?? defaultGridSpacing
  return Object.freeze({
    grid: options.grid,
    spacing: Number.isFinite(spacing) && spacing > 0 ? spacing : defaultGridSpacing,
    color: options.color ?? themeColor('grid'),
    majorColor: options.majorColor ?? themeColor('grid-major'),
    adaptive: options.adaptive !== false,
  })
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
    if (mark?.type !== 'nodes' && mark?.type !== 'edges') {
      throw new TypeError('defineGraph: every mark must come from nodes() or edges()')
    }
  }
  for (const hull of options.hulls ?? []) {
    if (hull?.type !== 'hull') throw new TypeError('defineGraph: every hull must come from hull()')
  }
  const bundling = options.bundling ?? null
  if (bundling !== null && typeof bundling.start !== 'function') {
    throw new TypeError('defineGraph: bundling must have a start function')
  }
  if (freeStateNames(options.states ?? {}).length > maxFreeStates) {
    throw new RangeError(
      `defineGraph: at most ${maxFreeStates} states besides selected, hovered and focused`,
    )
  }
  return Object.freeze({
    marks: Object.freeze([...options.marks]),
    scales: Object.freeze({ ...options.scales }),
    states: Object.freeze({ ...options.states }) as StateStyles<S>,
    layout: options.layout ?? null,
    interaction: resolveInteraction(options.interaction),
    view: resolveView(options.view),
    transitions: Object.freeze({
      positions: Math.max(0, options.transitions?.positions ?? defaultPositionTransition),
      layout: Math.max(0, options.transitions?.layout ?? defaultLayoutTransition),
    }),
    background: resolveBackground(options.background),
    hulls: Object.freeze([...(options.hulls ?? [])]),
    bundling,
  })
}
