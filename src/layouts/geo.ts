import { toAccessor } from '../core/accessor'
import { projectLatitude, projectLongitude } from '../core/geo'
import { groupGap, separateGroups } from '../core/group-separation'
import { groupTree } from '../core/group-tree'
import { offsetAt } from '../core/spread'
import type { Channel, GeoPoint, Layout, LayoutGraph } from '../types'
import { CellTable, Occupancy } from './occupancy'
import { degrees, instant, movers, type NodeOrder } from './shared'

/** Options of `geo`. */
export interface GeoOptions<T = unknown> {
  /** Longitude of each node in degrees, a field name or a function. Defaults to `longitude`. */
  readonly longitude?: Channel<T, number> | undefined
  /** Latitude of each node in degrees, a field name or a function. Defaults to `latitude`. */
  readonly latitude?: Channel<T, number> | undefined
  /**
   * Place drawn at the world origin, `x` and `y` 0. Defaults to the middle of the box around the
   * nodes that have coordinates.
   */
  readonly center?: GeoPoint | undefined
  /**
   * World units per unit of the Web Mercator world, which spans 512 units on a map. Defaults to a
   * scale chosen from the data, such that few places overlap and the graph stays compact.
   */
  readonly scale?: number | undefined
  /**
   * Gap kept between the borders of nodes that would overlap, in world units. Defaults to a quarter
   * of the median diameter.
   */
  readonly spacing?: number | undefined
  /**
   * Order of the nodes that share a place, from the place outward. Defaults to the internal order.
   */
  readonly order?: NodeOrder<T> | undefined
}

const crowdCell = 3
const crowdTarget = 0.2
const scaleBelow = 2
const scaleAbove = 5
const scaleSteps = 12
const groupRounds = 64

const bits = new Float64Array(2)
const words = new Int32Array(bits.buffer)

function tableSize(count: number): number {
  let size = 16
  while (size < count * 2) size *= 2
  return size
}

function pointHash(x: number, y: number): number {
  bits[0] = x
  bits[1] = y
  const a = Math.imul((words[0] ?? 0) ^ (words[1] ?? 0), 0x9e3779b1)
  const b = Math.imul((words[2] ?? 0) ^ (words[3] ?? 0), 0x85ebca77)
  return (a ^ (b >>> 15) ^ (a >>> 13)) >>> 0
}

interface Places {
  readonly count: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly start: Int32Array
  readonly members: Int32Array
}

function placesOf(
  nodes: readonly number[],
  x: Float64Array,
  y: Float64Array,
  valid: Uint8Array,
): Places {
  const size = tableSize(nodes.length)
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const px = new Float64Array(nodes.length)
  const py = new Float64Array(nodes.length)
  const placeOf = new Int32Array(nodes.length).fill(-1)
  const sizes = new Int32Array(nodes.length + 1)
  let count = 0
  for (let k = 0; k < nodes.length; k++) {
    if (valid[k] !== 1) continue
    const kx = x[k] ?? 0
    const ky = y[k] ?? 0
    let slot = pointHash(kx, ky) & mask
    for (;;) {
      const id = table[slot] ?? -1
      if (id < 0) {
        table[slot] = count
        px[count] = kx
        py[count] = ky
        placeOf[k] = count++
        break
      }
      if (px[id] === kx && py[id] === ky) {
        placeOf[k] = id
        break
      }
      slot = (slot + 1) & mask
    }
    const id = placeOf[k] ?? 0
    sizes[id + 1] = (sizes[id + 1] ?? 0) + 1
  }
  const start = new Int32Array(count + 1)
  for (let id = 0; id < count; id++) start[id + 1] = (start[id] ?? 0) + (sizes[id + 1] ?? 0)
  const filled = start.slice(0, count)
  const members = new Int32Array(start[count] ?? 0)
  for (let k = 0; k < nodes.length; k++) {
    const id = placeOf[k] ?? -1
    if (id < 0) continue
    const at = filled[id] ?? 0
    members[at] = nodes[k] ?? 0
    filled[id] = at + 1
  }
  return { count, x: px, y: py, start, members }
}

class Crowding {
  readonly #places: Places
  readonly #table: Int32Array
  readonly #mask: number
  readonly #cellX: Int32Array
  readonly #cellY: Int32Array
  readonly #hits: Int32Array

  constructor(places: Places) {
    this.#places = places
    const size = tableSize(places.count)
    this.#table = new Int32Array(size)
    this.#mask = size - 1
    this.#cellX = new Int32Array(places.count)
    this.#cellY = new Int32Array(places.count)
    this.#hits = new Int32Array(places.count)
  }

  share(cell: number, shift: number): number {
    const { count, x, y } = this.#places
    const table = this.#table
    const cellX = this.#cellX
    const cellY = this.#cellY
    const hits = this.#hits
    table.fill(-1)
    for (let id = 0; id < count; id++) {
      const cx = Math.floor((x[id] ?? 0) / cell + shift)
      const cy = Math.floor((y[id] ?? 0) / cell + shift)
      cellX[id] = cx
      cellY[id] = cy
      hits[id] = 0
      let slot = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.#mask
      for (;;) {
        const owner = table[slot] ?? -1
        if (owner < 0) {
          table[slot] = id
          hits[id] = 1
          break
        }
        if (cellX[owner] === cx && cellY[owner] === cy) {
          hits[owner] = (hits[owner] ?? 0) + 1
          break
        }
        slot = (slot + 1) & this.#mask
      }
    }
    let crowded = 0
    for (let id = 0; id < count; id++) {
      const hit = hits[id] ?? 0
      if (hit > 1) crowded += hit
    }
    return crowded / count
  }
}

function fittedScale(places: Places, pitch: number): number {
  const { count, x, y } = places
  if (count < 2 || !(pitch > 0)) return 1
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let id = 0; id < count; id++) {
    minX = Math.min(minX, x[id] ?? 0)
    minY = Math.min(minY, y[id] ?? 0)
    maxX = Math.max(maxX, x[id] ?? 0)
    maxY = Math.max(maxY, y[id] ?? 0)
  }
  const extent = Math.max(maxX - minX, maxY - minY)
  if (!(extent > 0)) return 1
  const fit = Math.log2((2 * pitch * Math.sqrt(count)) / extent)
  const crowding = new Crowding(places)
  const crowded = (power: number) => {
    const cell = pitch / 2 ** power
    return crowding.share(cell, 0) + crowding.share(cell, 0.5) > 2 * crowdTarget
  }
  let low = fit - scaleBelow
  let high = fit + scaleAbove
  if (!crowded(low)) return 2 ** low
  if (crowded(high)) return 2 ** high
  for (let step = 0; step < scaleSteps; step++) {
    const middle = (low + high) / 2
    if (crowded(middle)) low = middle
    else high = middle
  }
  return 2 ** high
}

function crowdOf(places: Places, scale: number, cell: number): Int32Array {
  const { count, x, y, start } = places
  const table = new CellTable(count)
  const cellX = new Int32Array(count)
  const cellY = new Int32Array(count)
  for (let id = 0; id < count; id++) {
    const cx = Math.floor(((x[id] ?? 0) * scale) / cell)
    const cy = Math.floor(((y[id] ?? 0) * scale) / cell)
    cellX[id] = cx
    cellY[id] = cy
    const size = (start[id + 1] ?? 0) - (start[id] ?? 0)
    table.set(cx, cy, Math.max(table.get(cx, cy), 0) + size)
  }
  const crowd = new Int32Array(count)
  for (let id = 0; id < count; id++) crowd[id] = table.get(cellX[id] ?? 0, cellY[id] ?? 0)
  return crowd
}

function median(values: Float64Array): number {
  if (values.length === 0) return 0
  values.sort()
  return values[values.length >> 1] ?? 0
}

function radiusAt(graph: LayoutGraph, index: number): number {
  const r = graph.radius[index] ?? 0
  return r > 0 && Number.isFinite(r) ? r : 0
}

function comparer<T>(
  graph: LayoutGraph<T>,
  order: NodeOrder<T> | undefined,
): ((a: number, b: number) => number) | null {
  if (order === 'degree') {
    const degree = degrees(graph)
    return (a, b) => (degree[b] ?? 0) - (degree[a] ?? 0) || a - b
  }
  if (!order) return null
  return (a, b) => order(graph.datum(a) as T, graph.datum(b) as T) || a - b
}

function adjacency(graph: LayoutGraph): { start: Int32Array; next: Int32Array } {
  const { capacity, edges, alive } = graph
  const start = new Int32Array(capacity + 1)
  for (let at = 0; at + 1 < edges.length; at += 2) {
    const u = edges[at] ?? 0
    const v = edges[at + 1] ?? 0
    if (alive[u] !== 1 || alive[v] !== 1) continue
    start[u + 1] = (start[u + 1] ?? 0) + 1
    start[v + 1] = (start[v + 1] ?? 0) + 1
  }
  for (let index = 0; index < capacity; index++) {
    start[index + 1] = (start[index + 1] ?? 0) + (start[index] ?? 0)
  }
  const filled = start.slice(0, capacity)
  const next = new Int32Array(start[capacity] ?? 0)
  for (let at = 0; at + 1 < edges.length; at += 2) {
    const u = edges[at] ?? 0
    const v = edges[at + 1] ?? 0
    if (alive[u] !== 1 || alive[v] !== 1) continue
    next[filled[u] ?? 0] = v
    filled[u] = (filled[u] ?? 0) + 1
    next[filled[v] ?? 0] = u
    filled[v] = (filled[v] ?? 0) + 1
  }
  return { start, next }
}

function placeStrays(
  graph: LayoutGraph,
  xy: Float32Array,
  placed: Uint8Array,
  strays: readonly number[],
  occupancy: Occupancy,
): number[] {
  const { start, next } = adjacency(graph)
  let frontier: number[] = []
  const queued = new Uint8Array(graph.capacity)
  for (const index of strays) {
    for (let at = start[index] ?? 0; at < (start[index + 1] ?? 0); at++) {
      if (placed[next[at] ?? 0] === 1) {
        frontier.push(index)
        queued[index] = 1
        break
      }
    }
  }
  while (frontier.length > 0) {
    for (const index of frontier) {
      let sumX = 0
      let sumY = 0
      let near = 0
      for (let at = start[index] ?? 0; at < (start[index + 1] ?? 0); at++) {
        const other = next[at] ?? 0
        if (placed[other] !== 1) continue
        sumX += xy[other * 2] ?? 0
        sumY += xy[other * 2 + 1] ?? 0
        near++
      }
      occupancy.place(index, sumX / near, sumY / near, radiusAt(graph, index), xy)
    }
    const following: number[] = []
    for (const index of frontier) placed[index] = 1
    for (const index of frontier) {
      for (let at = start[index] ?? 0; at < (start[index + 1] ?? 0); at++) {
        const other = next[at] ?? 0
        if (placed[other] === 1 || queued[other] === 1 || graph.movable[other] !== 1) continue
        queued[other] = 1
        following.push(other)
      }
    }
    frontier = following
  }
  return strays.filter((index) => placed[index] !== 1)
}

function placeAside(
  graph: LayoutGraph,
  xy: Float32Array,
  placed: Uint8Array,
  rest: readonly number[],
  spacing: number,
): void {
  let largest = 0
  for (const index of rest) largest = Math.max(largest, radiusAt(graph, index) * 2)
  const cell = largest + spacing
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (let index = 0; index < graph.capacity; index++) {
    if (placed[index] !== 1 || graph.alive[index] !== 1) continue
    const r = radiusAt(graph, index)
    minY = Math.min(minY, (xy[index * 2 + 1] ?? 0) - r)
    maxX = Math.max(maxX, (xy[index * 2] ?? 0) + r)
  }
  const columns = Math.ceil(Math.sqrt(rest.length))
  const rows = Math.ceil(rest.length / columns)
  const left = Number.isFinite(maxX) ? maxX + 2 * cell + largest / 2 : -((columns - 1) * cell) / 2
  const top = Number.isFinite(minY) ? minY + largest / 2 : -((rows - 1) * cell) / 2
  rest.forEach((index, at) => {
    xy[index * 2] = left + (at % columns) * cell
    xy[index * 2 + 1] = top + Math.floor(at / columns) * cell
  })
}

function middleOf(places: Places, center: GeoPoint | undefined): readonly [number, number] {
  if (center && Number.isFinite(center.longitude) && Number.isFinite(center.latitude)) {
    return [projectLongitude(center.longitude), projectLatitude(center.latitude)]
  }
  if (places.count === 0) return [0, 0]
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let id = 0; id < places.count; id++) {
    minX = Math.min(minX, places.x[id] ?? 0)
    minY = Math.min(minY, places.y[id] ?? 0)
    maxX = Math.max(maxX, places.x[id] ?? 0)
    maxY = Math.max(maxY, places.y[id] ?? 0)
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

interface Spread {
  readonly places: Places
  readonly middle: readonly [number, number]
  readonly scale: number
  readonly typical: number
  readonly spacing: number
  readonly compare: ((a: number, b: number) => number) | null
}

function spreadPlaces(
  graph: LayoutGraph,
  spread: Spread,
  occupancy: Occupancy,
  placed: Uint8Array,
  xy: Float32Array,
  strays: number[],
): void {
  const { places, middle, scale, typical, spacing, compare } = spread
  const { start, members } = places
  const crowd = crowdOf(places, scale, (typical + spacing) * crowdCell)
  const sizeOf = (id: number) => (start[id + 1] ?? 0) - (start[id] ?? 0)
  const sequence = Int32Array.from({ length: places.count }, (_, id) => id)
  sequence.sort((a, b) => (crowd[b] ?? 0) - (crowd[a] ?? 0) || sizeOf(b) - sizeOf(a) || a - b)
  for (const id of sequence) {
    const px = ((places.x[id] ?? 0) - middle[0]) * scale
    const py = ((places.y[id] ?? 0) - middle[1]) * scale
    const group = members.subarray(start[id] ?? 0, start[id + 1] ?? 0)
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      strays.push(...group)
      continue
    }
    if (compare && group.length > 1) group.sort(compare)
    let largest = 0
    for (const index of group) largest = Math.max(largest, radiusAt(graph, index) * 2)
    group.forEach((index, at) => {
      const [dx, dy] = offsetAt(at, group.length, largest + spacing)
      placed[index] = 1
      occupancy.place(index, px + dx, py + dy, radiusAt(graph, index), xy)
    })
  }
}

/**
 * A layout that places the free nodes by their longitude and latitude with Web Mercator, as on a
 * map, then moves overlapping nodes apart as little as it can. Nodes at the same place gather
 * around it, and nodes without coordinates go near their neighbors, else beside the others. It
 * ends at once, and nodes glide to their place.
 */
export function geo<T = unknown>(options: GeoOptions<T> = {}): Layout<T> {
  const readLongitude = toAccessor<T, unknown>(options.longitude ?? 'longitude')
  const readLatitude = toAccessor<T, unknown>(options.latitude ?? 'latitude')
  return instant(
    'geo',
    options,
    (graph) => {
      const xy = Float32Array.from(graph.xy)
      const nodes = movers(graph)
      if (nodes.length === 0) return xy
      const count = nodes.length
      const x = new Float64Array(count)
      const y = new Float64Array(count)
      const valid = new Uint8Array(count)
      const diameters = new Float64Array(count)
      for (let k = 0; k < count; k++) {
        const index = nodes[k] ?? 0
        diameters[k] = radiusAt(graph, index) * 2
        const datum = graph.datum(index) as T
        const longitude = readLongitude(datum)
        const latitude = readLatitude(datum)
        if (typeof longitude !== 'number' || !Number.isFinite(longitude)) continue
        if (typeof latitude !== 'number' || !Number.isFinite(latitude)) continue
        x[k] = projectLongitude(longitude) + 0
        y[k] = projectLatitude(latitude) + 0
        valid[k] = 1
      }
      const typical = median(diameters)
      const given = options.spacing
      const spacing =
        given !== undefined && Number.isFinite(given) && given >= 0 ? given : typical / 4
      const places = placesOf(nodes, x, y, valid)
      const placed = new Uint8Array(graph.capacity)
      const occupancy = new Occupancy(graph.capacity, typical + spacing, spacing)
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.alive[index] !== 1 || graph.movable[index] === 1) continue
        placed[index] = 1
        occupancy.add(index, xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0, radiusAt(graph, index))
      }
      const strays: number[] = []
      for (let k = 0; k < count; k++) if (valid[k] !== 1) strays.push(nodes[k] ?? 0)
      const spread: Spread = {
        places,
        middle: middleOf(places, options.center),
        scale:
          options.scale !== undefined && Number.isFinite(options.scale) && options.scale > 0
            ? options.scale
            : fittedScale(places, typical + spacing),
        typical,
        spacing,
        compare: comparer(graph as LayoutGraph<T>, options.order),
      }
      spreadPlaces(graph, spread, occupancy, placed, xy, strays)
      if (strays.length > 0) {
        const rest = placeStrays(graph, xy, placed, strays, occupancy)
        if (rest.length > 0) placeAside(graph, xy, placed, rest, spacing)
      }
      separateInGroups(graph, xy, spacing)
      return xy
    },
    false,
  )
}

function separateInGroups(graph: LayoutGraph, xy: Float32Array, spacing: number): void {
  const tree = groupTree(graph.capacity, graph.alive, graph.groups)
  if (!tree) return
  const fixed = new Uint8Array(graph.capacity)
  for (let index = 0; index < graph.capacity; index++) {
    fixed[index] = graph.movable[index] === 1 ? 0 : 1
  }
  separateGroups(tree, graph.alive, graph.radius, fixed, xy, {
    spacing,
    groupSpacing: groupGap,
    rounds: groupRounds,
    nodes: 'all',
  })
}
