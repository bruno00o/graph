import { flowSpeed } from '../core/flow'
import type { ResolvedStateStyle, StateBuffers } from '../core/state-buffers'
import { isBuiltInState, styleFor } from '../core/state-names'
import { withoutUndefined } from '../core/without-undefined'
import { builtInStyles, defaults } from '../theme/tokens'
import type { GraphDefinition, StateLook } from '../types'
import type { StateRegistry } from './state-registry'

export function resolveStyle(
  style: StateLook & { readonly raise?: boolean | undefined },
  id: (color: string) => number,
): ResolvedStateStyle {
  const color = (value: string | undefined) => (value === undefined ? undefined : id(value))
  const ringed = style.outlineWidth !== undefined || style.outline !== undefined
  return {
    opacity: style.opacity,
    strokeWidth: style.strokeWidth,
    halo: style.halo,
    label: style.label,
    fill: color(style.fill),
    stroke: color(style.stroke),
    outline: color(style.outline),
    labelColor: color(style.labelColor),
    flow: style.flow === undefined ? undefined : flowSpeed(style.flow),
    raise: style.raise,
    hide: style.hide,
    outlineWidth: ringed ? (style.outlineWidth ?? defaults.nodeOutlineWidth) : undefined,
  }
}

export function applyStateStyles(
  states: GraphDefinition['states'],
  registry: StateRegistry,
  buffers: StateBuffers,
  id: (color: string) => number,
  grouped: boolean,
): void {
  const edgeHide = buffers.edgeHide
  for (const kind of ['nodes', 'edges'] as const) {
    registry.names.forEach((name, bit) => {
      const own = styleFor(states[name], kind)
      const style = isBuiltInState(name)
        ? { ...builtInStyles[kind][name], ...(own && withoutUndefined(own)) }
        : own
      const others = style?.others
      buffers.setStyle(
        kind,
        bit,
        style ? resolveStyle(style, id) : null,
        others ? resolveStyle({ ...others, raise: undefined }, id) : null,
      )
    })
    for (let bit = registry.names.length; bit < 32; bit++) buffers.setStyle(kind, bit, null)
  }
  if (buffers.edgeHide !== edgeHide && grouped) registry.refresh()
}
