import type {
  BadgeCorner,
  EdgeEndOptions,
  EdgeEndsOptions,
  EdgeMark,
  LabelTextOptions,
  NodeMark,
} from '../types'
import { toAccessor } from './accessor'
import { rawRead } from './raw'

export type Read = (datum: unknown) => unknown

export interface CompiledNodeMark {
  readonly color: Read | null
  readonly colorRaw: boolean
  readonly size: Read | null
  readonly sizeRaw: boolean
  readonly x: Read | null
  readonly y: Read | null
  readonly longitude: Read | null
  readonly latitude: Read | null
  readonly label: Read | null
  readonly secondary: Read | null
  readonly labelBackground: Read | null
  readonly labelText: CompiledLabelText
  readonly labelPlacement: Read | null
  readonly labelMinScreenSize: Read | null
  readonly shape: Read | null
  readonly width: Read | null
  readonly cornerRadius: Read | null
  readonly fill: Read | null
  readonly stroke: Read | null
  readonly strokeWidth: Read | null
  readonly outline: Read | null
  readonly outlineWidth: Read | null
  readonly opacity: Read | null
  readonly minZoom: Read | null
  readonly maxZoom: Read | null
  readonly time: Read | null
  readonly image: Read | null
  readonly badges: ReadonlyArray<readonly [BadgeCorner, Read]>
  readonly screenUnits: boolean
  readonly parent: Read | null
  readonly container: CompiledContainer
}

export interface CompiledContainer {
  readonly shape: Read | null
  readonly padding: Read | null
  readonly fill: Read | null
  readonly stroke: Read | null
  readonly strokeWidth: Read | null
  readonly spread: Read | null
  readonly gap: Read | null
}

export interface CompiledLabelText {
  readonly color: Read | null
  readonly size: Read | null
  readonly weight: Read | null
  readonly font: Read | null
  readonly maxWidth: Read | null
}

export interface CompiledEdgeMark {
  readonly color: Read | null
  readonly colorRaw: boolean
  readonly width: Read | null
  readonly widthRaw: boolean
  readonly label: Read | null
  readonly labelBackground: Read | null
  readonly labelText: CompiledLabelText
  readonly dash: Read | null
  readonly arrow: Read | null
  readonly stroke: Read | null
  readonly opacity: Read | null
  readonly minZoom: Read | null
  readonly maxZoom: Read | null
  readonly time: Read | null
  readonly flow: Read | null
  readonly bundle: Read | null
  readonly route: Read | null
  readonly bridge: Read | null
  readonly geodesic: Read | null
  readonly ends: CompiledEnds | null
}

export interface CompiledEnd {
  readonly color: Read | null
  readonly colorRaw: boolean
  readonly stroke: Read | null
  readonly width: Read | null
  readonly widthRaw: boolean
  readonly dash: Read | null
  readonly label: Read | null
  readonly labelBackground: Read | null
  readonly labelText: CompiledLabelText
}

export interface CompiledEnds {
  readonly split: Read | null
  readonly source: CompiledEnd
  readonly target: CompiledEnd
  readonly styled: boolean
}

function channel(value: string | Read | undefined): Read | null {
  return value === undefined ? null : toAccessor(value)
}

function numberChannel(value: unknown): Read | null {
  if (typeof value === 'number') return () => value
  return rawRead(value) ?? channel(value as string | Read | undefined)
}

function colorChannel(value: unknown): Read | null {
  return rawRead(value) ?? channel(value as string | Read | undefined)
}

function isRaw(value: unknown, literal: boolean): boolean {
  return (literal && typeof value === 'number') || rawRead(value) !== undefined
}

function style(value: unknown): Read | null {
  if (value === undefined) return null
  return typeof value === 'function' ? (value as Read) : () => value
}

function labelText(options: LabelTextOptions<unknown> | null): CompiledLabelText {
  return {
    color: style(options?.color),
    size: style(options?.size),
    weight: style(options?.weight),
    font: style(options?.font),
    maxWidth: style(options?.maxWidth),
  }
}

function compileEnd(options: EdgeEndOptions<unknown> | undefined): CompiledEnd {
  const label = options?.label
  return {
    color: colorChannel(options?.color),
    colorRaw: isRaw(options?.color, false),
    stroke: style(options?.stroke),
    width: numberChannel(options?.width),
    widthRaw: isRaw(options?.width, true),
    dash: style(options?.dash),
    label: channel(typeof label === 'object' ? label.text : label),
    labelBackground: style(typeof label === 'object' ? label.background : undefined),
    labelText: labelText(typeof label === 'object' ? label : null),
  }
}

function compileEnds(options: EdgeEndsOptions<unknown> | undefined): CompiledEnds | null {
  if (!options) return null
  const source = compileEnd(options.source)
  const target = compileEnd(options.target)
  const styled = (end: CompiledEnd) => !!(end.color || end.stroke || end.width || end.dash)
  return {
    split: style(options.split),
    source,
    target,
    styled: styled(source) || styled(target),
  }
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
    color: colorChannel(options.color),
    colorRaw: isRaw(options.color, false),
    size: numberChannel(options.size),
    sizeRaw: isRaw(options.size, true),
    x: channel(options.x),
    y: channel(options.y),
    longitude: channel(options.longitude),
    latitude: channel(options.latitude),
    label: channel(typeof label === 'object' ? label.text : label),
    secondary: channel(typeof label === 'object' ? label.secondary : undefined),
    labelBackground: style(typeof label === 'object' ? label.background : undefined),
    labelText: labelText(typeof label === 'object' ? label : null),
    labelPlacement: style(typeof label === 'object' ? label.placement : undefined),
    labelMinScreenSize: style(typeof label === 'object' ? label.minScreenSize : undefined),
    shape: style(options.shape),
    width: style(options.width),
    cornerRadius: style(options.cornerRadius),
    fill: style(options.fill),
    stroke: style(options.stroke),
    strokeWidth: style(options.strokeWidth),
    outline: style(options.outline),
    outlineWidth: style(options.outlineWidth),
    opacity: style(options.opacity),
    minZoom: style(options.minZoom),
    maxZoom: style(options.maxZoom),
    time: channel(options.time),
    image: style(options.image),
    badges,
    screenUnits:
      options.units === 'screen' ||
      (options.units === undefined &&
        options.longitude !== undefined &&
        options.latitude !== undefined),
    parent: channel(options.parent),
    container: {
      shape: style(options.container?.shape),
      padding: style(options.container?.padding),
      fill: style(options.container?.fill),
      stroke: style(options.container?.stroke),
      strokeWidth: style(options.container?.strokeWidth),
      spread: style(options.container?.spread),
      gap: style(options.container?.gap),
    },
  }
  nodeCache.set(mark, compiled)
  return compiled
}

export function compileEdgeMark(mark: EdgeMark<unknown>): CompiledEdgeMark {
  const cached = edgeCache.get(mark)
  if (cached) return cached
  const options = mark.options
  const label = options.label
  const compiled: CompiledEdgeMark = {
    color: colorChannel(options.color),
    colorRaw: isRaw(options.color, false),
    width: numberChannel(options.width),
    widthRaw: isRaw(options.width, true),
    label: channel(typeof label === 'object' ? label.text : label),
    labelBackground: style(typeof label === 'object' ? label.background : undefined),
    labelText: labelText(typeof label === 'object' ? label : null),
    dash: style(options.dash),
    arrow: style(options.arrow),
    stroke: style(options.stroke),
    opacity: style(options.opacity),
    minZoom: style(options.minZoom),
    maxZoom: style(options.maxZoom),
    time: channel(options.time),
    flow: style(options.flow),
    bundle: style(options.bundle),
    route: style(options.route),
    bridge: style(options.bridge),
    geodesic: style(options.geodesic),
    ends: compileEnds(options.ends),
  }
  edgeCache.set(mark, compiled)
  return compiled
}
