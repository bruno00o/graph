import type { ForceGraph, ForceSettings } from './simulation'

export interface BatchJob {
  readonly id: number
  readonly graph: ForceGraph
  readonly settings: ForceSettings
}

export interface PackedBatch {
  readonly type: 'batch'
  readonly header: Int32Array
  readonly data: ArrayBuffer
  readonly settings: readonly ForceSettings[]
}

export interface PackedResults {
  readonly type: 'done'
  readonly ids: Int32Array
  readonly data: Float32Array
}

type Field = Uint8Array | Uint32Array | Int32Array | Float32Array

const fieldCount = 11
const headerStride = 3 + fieldCount
const kinds = [
  Uint8Array,
  Uint8Array,
  Float32Array,
  Float32Array,
  Uint32Array,
  Float32Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Uint8Array,
  Float32Array,
] as const

function fieldsOf(graph: ForceGraph): readonly (Field | undefined)[] {
  const groups = graph.groups
  return [
    graph.alive,
    graph.movable,
    graph.xy,
    graph.radius,
    graph.edges,
    graph.mass,
    groups?.order,
    groups?.parent,
    groups?.padding,
    groups?.circle,
    groups?.labelSpace,
  ]
}

function bytesOf(field: number, length: number): number {
  return (length * (kinds[field] as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT + 3) & ~3
}

function settingsKey(settings: ForceSettings): string {
  return `${settings.edgeLength},${settings.repulsion},${settings.gravity},${settings.spacing},${settings.cohesion},${settings.groupSpacing},${settings.steps},${settings.engine},${settings.multilevel},${settings.untangle}`
}

export function costOf(graph: ForceGraph, settings: ForceSettings): number {
  return (graph.capacity + graph.edges.length / 2 + 8) * settings.steps
}

export function packBatch(jobs: readonly BatchJob[]): PackedBatch {
  const header = new Int32Array(jobs.length * headerStride)
  const table: ForceSettings[] = []
  const known = new Map<string, number>()
  let size = 0
  jobs.forEach((job, at) => {
    const base = at * headerStride
    const key = settingsKey(job.settings)
    let chosen = known.get(key)
    if (chosen === undefined) {
      chosen = table.length
      known.set(key, chosen)
      table.push(job.settings)
    }
    header[base] = job.id
    header[base + 1] = job.graph.capacity
    header[base + 2] = chosen
    fieldsOf(job.graph).forEach((field, k) => {
      header[base + 3 + k] = field ? field.length : -1
      if (field) size += bytesOf(k, field.length)
    })
  })
  const data = new ArrayBuffer(size)
  const bytes = new Uint8Array(data)
  let offset = 0
  for (const job of jobs) {
    fieldsOf(job.graph).forEach((field, k) => {
      if (!field) return
      bytes.set(new Uint8Array(field.buffer, field.byteOffset, field.byteLength), offset)
      offset += bytesOf(k, field.length)
    })
  }
  return { type: 'batch', header, data, settings: table }
}

export function unpackBatch(batch: PackedBatch): BatchJob[] {
  const { header, data, settings } = batch
  const jobs: BatchJob[] = []
  let offset = 0
  for (let base = 0; base + headerStride <= header.length; base += headerStride) {
    const fields: (Field | undefined)[] = []
    for (let k = 0; k < fieldCount; k++) {
      const length = header[base + 3 + k] ?? -1
      if (length < 0) {
        fields.push(undefined)
        continue
      }
      const Kind = kinds[k] as Float32ArrayConstructor
      fields.push(new Kind(data, offset, length) as Field)
      offset += bytesOf(k, length)
    }
    const [alive, movable, xy, radius, edges, mass, order, parent, padding, circle, labelSpace] =
      fields
    const graph: ForceGraph = {
      capacity: header[base + 1] ?? 0,
      alive: alive as Uint8Array,
      movable: movable as Uint8Array,
      xy: xy as Float32Array,
      radius: radius as Float32Array,
      edges: edges as Uint32Array,
      ...(mass ? { mass: mass as Float32Array } : {}),
      ...(order
        ? {
            groups: {
              order: order as Uint32Array,
              parent: parent as Int32Array,
              padding: padding as Float32Array,
              circle: circle as Uint8Array,
              ...(labelSpace ? { labelSpace: labelSpace as Float32Array } : {}),
            },
          }
        : {}),
    }
    jobs.push({
      id: header[base] ?? 0,
      graph,
      settings: settings[header[base + 2] ?? 0] as ForceSettings,
    })
  }
  return jobs
}

export function packResults(results: readonly (readonly [number, Float32Array])[]): PackedResults {
  let size = 0
  for (const [, xy] of results) size += xy.length
  const ids = new Int32Array(results.length * 2)
  const data = new Float32Array(size)
  let offset = 0
  results.forEach(([id, xy], at) => {
    ids[at * 2] = id
    ids[at * 2 + 1] = xy.length
    data.set(xy, offset)
    offset += xy.length
  })
  return { type: 'done', ids, data }
}

export function unpackResults(
  results: PackedResults,
  visit: (id: number, xy: Float32Array) => void,
): void {
  let offset = 0
  for (let at = 0; at + 1 < results.ids.length; at += 2) {
    const length = results.ids[at + 1] ?? 0
    visit(results.ids[at] ?? 0, results.data.subarray(offset, offset + length))
    offset += length
  }
}
