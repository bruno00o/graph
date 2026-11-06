import { freeStateNames, maxFreeStates } from './core/state-names'
import { themeColor } from './theme/tokens'
import type {
  BackgroundOptions,
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  ResolvedBackground,
  ResolvedInteraction,
  StateStyles,
} from './types'

const defaultZoomSpeed = 1
const defaultPositionTransition = 120
const defaultLayoutTransition = 400
const defaultGridSpacing = 16

function resolveInteraction(options: InteractionOptions = {}): ResolvedInteraction {
  const zoom = options.zoom ?? true
  return Object.freeze({
    pan: options.pan ?? true,
    zoom:
      zoom === false
        ? false
        : Object.freeze({ speed: (zoom === true ? undefined : zoom.speed) ?? defaultZoomSpeed }),
    select: options.select ?? 'multiple',
    drag: options.drag ?? true,
    lasso: options.lasso ?? false,
    keyboard: options.keyboard ?? true,
    fold: options.fold ?? true,
  })
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
    transitions: Object.freeze({
      positions: Math.max(0, options.transitions?.positions ?? defaultPositionTransition),
      layout: Math.max(0, options.transitions?.layout ?? defaultLayoutTransition),
    }),
    background: resolveBackground(options.background),
    hulls: Object.freeze([...(options.hulls ?? [])]),
  })
}
