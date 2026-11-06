import { freeStateNames, maxFreeStates } from './core/state-names'
import { themeColor } from './theme/tokens'
import type {
  BackgroundOptions,
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  ResolvedBackground,
  ResolvedInteraction,
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
  })
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
  })
}

/**
 * Builds a frozen graph definition from marks, scales, states and options. The names of `states`
 * become the state names accepted by the instance.
 */
export function defineGraph<S extends string = never>(
  options: GraphDefinitionOptions<S>,
): GraphDefinition<S> {
  for (const mark of options.marks) {
    if (mark?.type !== 'nodes' && mark?.type !== 'edges') {
      throw new TypeError('defineGraph: every mark must come from nodes() or edges()')
    }
  }
  for (const hull of options.hulls ?? []) {
    if (hull?.type !== 'hull') throw new TypeError('defineGraph: every hull must come from hull()')
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
  })
}
