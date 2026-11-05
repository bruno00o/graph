import type {
  GraphDefinition,
  GraphDefinitionOptions,
  InteractionOptions,
  ResolvedInteraction,
} from './types'

const defaultZoomSpeed = 1

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
  })
}

export function defineGraph(options: GraphDefinitionOptions): GraphDefinition {
  for (const mark of options.marks) {
    if (mark?.type !== 'nodes' && mark?.type !== 'edges') {
      throw new TypeError('defineGraph: every mark must come from nodes() or edges()')
    }
  }
  return Object.freeze({
    marks: Object.freeze([...options.marks]),
    scales: Object.freeze({ ...options.scales }),
    states: Object.freeze({ ...options.states }),
    interaction: resolveInteraction(options.interaction),
  })
}
