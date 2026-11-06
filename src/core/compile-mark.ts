import type { BadgeCorner, EdgeMark, NodeMark } from '../types'
import { toAccessor } from './accessor'

export type Read = (datum: unknown) => unknown

export interface CompiledNodeMark {
  readonly color: Read | null
  readonly size: Read | null
  readonly x: Read | null
  readonly y: Read | null
  readonly label: Read | null
  readonly secondary: Read | null
  readonly labelBackground: Read | null
  readonly shape: Read | null
  readonly fill: Read | null
  readonly stroke: Read | null
  readonly strokeWidth: Read | null
  readonly outline: Read | null
  readonly outlineWidth: Read | null
  readonly opacity: Read | null
  readonly image: Read | null
  readonly badges: ReadonlyArray<readonly [BadgeCorner, Read]>
  readonly screenUnits: boolean
}

export interface CompiledEdgeMark {
  readonly color: Read | null
  readonly width: Read | null
  readonly label: Read | null
  readonly dash: Read | null
  readonly arrow: Read | null
  readonly stroke: Read | null
  readonly opacity: Read | null
}

function channel(value: string | Read | undefined): Read | null {
  return value === undefined ? null : toAccessor(value)
}

function style(value: unknown): Read | null {
  if (value === undefined) return null
  return typeof value === 'function' ? (value as Read) : () => value
}

const badgeCorners: readonly BadgeCorner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

const nodeCache = new WeakMap<NodeMark<unknown>, CompiledNodeMark>()
const edgeCache = new WeakMap<EdgeMark<unknown>, CompiledEdgeMark>()

export function compileNodeMark(mark: NodeMark<unknown>): CompiledNodeMark {
  const cached = nodeCache.get(mark)
  if (cached) return cached
  const options = mark.options
  const label = options.label
  const badges: Array<readonly [BadgeCorner, Read]> = []
  for (const corner of badgeCorners) {
    const read = options.badges?.[corner]
    if (read) badges.push([corner, read])
  }
  const compiled: CompiledNodeMark = {
    color: channel(options.color),
    size: channel(options.size),
    x: channel(options.x),
    y: channel(options.y),
    label: channel(typeof label === 'object' ? label.text : label),
    secondary: channel(typeof label === 'object' ? label.secondary : undefined),
    labelBackground: style(typeof label === 'object' ? label.background : undefined),
    shape: style(options.shape),
    fill: style(options.fill),
    stroke: style(options.stroke),
    strokeWidth: style(options.strokeWidth),
    outline: style(options.outline),
    outlineWidth: style(options.outlineWidth),
    opacity: style(options.opacity),
    image: style(options.image),
    badges,
    screenUnits: options.units === 'screen',
  }
  nodeCache.set(mark, compiled)
  return compiled
}

export function compileEdgeMark(mark: EdgeMark<unknown>): CompiledEdgeMark {
  const cached = edgeCache.get(mark)
  if (cached) return cached
  const options = mark.options
  const compiled: CompiledEdgeMark = {
    color: channel(options.color),
    width: channel(options.width),
    label: channel(options.label),
    dash: style(options.dash),
    arrow: style(options.arrow),
    stroke: style(options.stroke),
    opacity: style(options.opacity),
  }
  edgeCache.set(mark, compiled)
  return compiled
}
