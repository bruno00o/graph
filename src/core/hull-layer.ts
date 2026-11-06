import { themeColor } from '../theme/tokens'
import type { Hull, HullOptions, Key, NodeMark } from '../types'
import { isKey, toAccessor } from './accessor'
import type { NodeColumns } from './columns'
import type { GraphModel } from './graph-model'
import {
  HullScratch,
  hullOutline,
  Outline,
  type OutlineShape,
  outlineStride,
} from './hull-geometry'
import type { Palette } from './palette'
import type { Positions } from './positions'

export const hullInstanceWords = 16

const defaultPadding = 16
const defaultStrokeWidth = 1
const fillShare = 12

export interface HullSource {
  readonly model: GraphModel
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly palette: Palette
  stateNodes(name: string): readonly Key[]
}

export interface HullShape {
  readonly outline: Outline
  readonly fill: number
  readonly stroke: number
  readonly strokeWidth: number
  readonly padding: number
}

type ColorOption = string | ((value: Key) => string) | undefined

interface Spec {
  readonly hull: Hull
  readonly options: HullOptions
  readonly keys: readonly Key[]
  readonly state: string | null
  readonly mark: NodeMark<unknown> | null
  readonly by: ((datum: unknown) => unknown) | null
  readonly shape: OutlineShape
  readonly padding: number
  readonly strokeWidth: number
  stateKeys: readonly Key[] | null
}

class Group implements HullShape {
  readonly outline: Outline = new Outline()
  members: number[] = []
  snapshot: Float32Array = new Float32Array(0)
  instances: Float32Array = new Float32Array(0)
  fill = 0
  stroke = 0
  strokeWidth = 0
  padding = 0
  dirty = true

  constructor(
    readonly spec: Spec,
    readonly value: Key | undefined,
  ) {}
}

function isMark(value: unknown): value is NodeMark<unknown> {
  return (
    typeof value === 'object' && value !== null && (value as NodeMark<unknown>).type === 'nodes'
  )
}

function sameMembers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function sameKeys(a: readonly Key[], b: readonly Key[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function toSpec(hull: Hull): Spec {
  const options = hull.options
  const mark = 'nodes' in options && isMark(options.nodes) ? options.nodes : null
  const by = 'by' in options && options.by !== undefined ? toAccessor(options.by) : null
  const padding = options.padding ?? defaultPadding
  const strokeWidth = options.strokeWidth ?? defaultStrokeWidth
  const keys = 'nodes' in options && !isMark(options.nodes) ? [...new Set(options.nodes)] : []
  return {
    hull,
    options,
    keys,
    state: hull.state,
    mark,
    by: by as ((datum: unknown) => unknown) | null,
    shape: options.shape === 'smooth' ? 'smooth' : 'rounded',
    padding: Number.isFinite(padding) ? Math.max(0, padding) : defaultPadding,
    strokeWidth: Number.isFinite(strokeWidth) ? Math.max(0, strokeWidth) : defaultStrokeWidth,
    stateKeys: null,
  }
}

function colorOf(option: ColorOption, value: Key | undefined): string | undefined {
  if (typeof option === 'function') return value === undefined ? undefined : option(value)
  return typeof option === 'string' && option !== '' ? option : undefined
}

export class HullLayer {
  data: ArrayBuffer = new ArrayBuffer(0)
  count = 0
  version = 0
  #specs: Spec[] = []
  #groups: Group[] = []
  #membership = true
  #positionsVersion = -1
  #packed = true
  readonly #scratch = new HullScratch()

  get shapes(): readonly HullShape[] {
    return this.#groups
  }

  get empty(): boolean {
    return this.#specs.length === 0
  }

  setHulls(hulls: readonly Hull[]): void {
    const kept = new Map(this.#specs.map((spec) => [spec.hull, spec]))
    this.#specs = hulls.map((hull) => kept.get(hull) ?? toSpec(hull))
    this.#membership = true
  }

  changed(): void {
    this.#membership = true
  }

  update(source: HullSource, deadline: number, now: () => number): boolean {
    if (this.#specs.length === 0) {
      if (this.#groups.length > 0) {
        this.#groups = []
        this.#pack()
      }
      return false
    }
    let groupsChanged = false
    if (this.#membership) {
      this.#membership = false
      this.#rebuild(source, () => true)
      groupsChanged = true
    } else {
      const states = new Set<Spec>()
      for (const spec of this.#specs) {
        if (spec.state === null) continue
        const keys = source.stateNodes(spec.state)
        if (spec.stateKeys === null || !sameKeys(spec.stateKeys, keys)) states.add(spec)
      }
      if (states.size > 0) {
        this.#rebuild(source, (spec) => states.has(spec))
        groupsChanged = true
      }
    }
    if (groupsChanged || source.positions.version !== this.#positionsVersion) {
      this.#positionsVersion = source.positions.version
      for (const group of this.#groups) if (!group.dirty) group.dirty = this.#moved(group, source)
    }
    let pending = false
    let computed = false
    for (const group of this.#groups) {
      if (!group.dirty) continue
      if (computed && now() > deadline) {
        pending = true
        break
      }
      this.#compute(group, source)
      computed = true
    }
    if (computed || groupsChanged || this.#packed) this.#pack()
    return pending
  }

  #rebuild(source: HullSource, touched: (spec: Spec) => boolean): void {
    const previous = new Map<Spec, Map<Key | undefined, Group>>()
    for (const group of this.#groups) {
      let byValue = previous.get(group.spec)
      if (!byValue) {
        byValue = new Map()
        previous.set(group.spec, byValue)
      }
      byValue.set(group.value, group)
    }
    const groups: Group[] = []
    for (const spec of this.#specs) {
      const kept = previous.get(spec)
      if (!touched(spec) && kept) {
        groups.push(...kept.values())
        continue
      }
      for (const [value, members] of this.#members(spec, source)) {
        const old = kept?.get(value)
        const group = old && sameMembers(old.members, members) ? old : new Group(spec, value)
        group.members = members
        this.#style(group, source)
        groups.push(group)
      }
    }
    this.#groups = groups
  }

  #members(spec: Spec, source: HullSource): Map<Key | undefined, number[]> {
    const { model, nodes } = source
    const result = new Map<Key | undefined, number[]>()
    const add = (value: Key | undefined, index: number) => {
      let list = result.get(value)
      if (!list) {
        list = []
        result.set(value, list)
      }
      list.push(index)
    }
    const addKey = (key: Key) => {
      const record = model.node(key)
      if (record && nodes.alive[record.index] === 1) add(undefined, record.index)
    }
    if (spec.state !== null) {
      const keys = source.stateNodes(spec.state)
      spec.stateKeys = keys
      for (const key of keys) addKey(key)
    } else if (spec.mark) {
      for (const record of model.nodes()) {
        if (record.mark !== spec.mark || nodes.alive[record.index] !== 1) continue
        if (!spec.by) {
          add(undefined, record.index)
          continue
        }
        const value = spec.by(record.datum)
        if (isKey(value)) add(value, record.index)
      }
    } else {
      for (const key of spec.keys) addKey(key)
    }
    return result
  }

  #style(group: Group, source: HullSource): void {
    const options = group.spec.options
    const color = colorOf(options.color, group.value)
    const stroke = colorOf(options.stroke, group.value) ?? color ?? themeColor('group-line')
    const fill =
      colorOf(options.fill, group.value) ??
      (color === undefined
        ? themeColor('group-fill')
        : `color-mix(in srgb, ${color} ${fillShare}%, transparent)`)
    const fillId = source.palette.id(fill)
    const strokeId = source.palette.id(stroke)
    const changed =
      fillId !== group.fill ||
      strokeId !== group.stroke ||
      group.spec.strokeWidth !== group.strokeWidth
    group.fill = fillId
    group.stroke = strokeId
    group.strokeWidth = group.spec.strokeWidth
    if (changed && !group.dirty) this.#instances(group)
  }

  #moved(group: Group, source: HullSource): boolean {
    const { nodes, positions } = source
    const snapshot = group.snapshot
    if (snapshot.length !== group.members.length * 3) return true
    for (let i = 0; i < group.members.length; i++) {
      const index = group.members[i] ?? 0
      if (
        snapshot[i * 3] !== positions.xy[index * 2] ||
        snapshot[i * 3 + 1] !== positions.xy[index * 2 + 1] ||
        snapshot[i * 3 + 2] !== nodes.size[index]
      ) {
        return true
      }
    }
    return false
  }

  #compute(group: Group, source: HullSource): void {
    const { nodes, positions } = source
    const scratch = this.#scratch
    const count = group.members.length
    scratch.reserve(count)
    scratch.count = count
    if (group.snapshot.length !== count * 3) group.snapshot = new Float32Array(count * 3)
    const snapshot = group.snapshot
    let screen = 0
    for (let i = 0; i < count; i++) {
      const index = group.members[i] ?? 0
      const x = positions.xy[index * 2] ?? 0
      const y = positions.xy[index * 2 + 1] ?? 0
      const size = nodes.size[index] ?? 0
      snapshot[i * 3] = x
      snapshot[i * 3 + 1] = y
      snapshot[i * 3 + 2] = size
      scratch.x[i] = x
      scratch.y[i] = y
      const onScreen = nodes.screenUnits[index] === 1
      scratch.r[i] = onScreen ? 0 : size / 2
      screen = Math.max(screen, (onScreen ? size / 2 : 0) + (nodes.outlineWidth[index] ?? 0))
    }
    hullOutline(scratch, group.spec.shape, group.outline)
    group.padding = group.spec.padding + screen
    group.dirty = false
    this.#instances(group)
  }

  #instances(group: Group): void {
    const { data, length } = group.outline
    const size = length * hullInstanceWords
    if (group.instances.length !== size) group.instances = new Float32Array(size)
    const floats = group.instances
    const words = new Uint32Array(floats.buffer, floats.byteOffset, size)
    let cx = 0
    let cy = 0
    for (let k = 0; k < length; k++) {
      cx += data[k * outlineStride] ?? 0
      cy += data[k * outlineStride + 1] ?? 0
    }
    cx /= Math.max(1, length)
    cy /= Math.max(1, length)
    let at = 0
    for (let k = 0; k < length; k++) {
      const from = k * outlineStride
      const to = ((k + 1) % length) * outlineStride
      for (let j = 0; j < outlineStride; j++) {
        floats[at + j] = data[from + j] ?? 0
        floats[at + outlineStride + j] = data[to + j] ?? 0
      }
      floats[at + 10] = cx
      floats[at + 11] = cy
      words[at + 12] = group.fill
      words[at + 13] = group.stroke
      floats[at + 14] = group.strokeWidth
      floats[at + 15] = group.padding
      at += hullInstanceWords
    }
  }

  #pack(): void {
    this.#packed = false
    let total = 0
    for (const group of this.#groups) total += group.instances.length
    if (total * 4 > this.data.byteLength) {
      this.data = new ArrayBuffer(Math.max(total * 4, this.data.byteLength * 2))
    }
    const floats = new Float32Array(this.data)
    let at = 0
    for (const group of this.#groups) {
      floats.set(group.instances, at)
      at += group.instances.length
    }
    this.count = at / hullInstanceWords
    this.version++
  }
}
