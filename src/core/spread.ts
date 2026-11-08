const goldenTurn = 2.399963229728653
const spiralPitch = 1.546
const ringLimit = 6
const primeX = 73856093
const primeY = 19349663
const cellLimit = 2 ** 30
const radiusRatio = 8
const stepSlack = 0.125

export const spreadGap = 4
export const spreadSteps = 4
export const spreadRounds = 3

export function offsetAt(at: number, size: number, pitch: number): readonly [number, number] {
  if (size <= 1) return [0, 0]
  if (size <= ringLimit) {
    const angle = -Math.PI / 2 + (2 * Math.PI * at) / size
    const reach = pitch / (2 * Math.sin(Math.PI / size))
    return [Math.cos(angle) * reach, Math.sin(angle) * reach]
  }
  const reach = (pitch / spiralPitch) * Math.sqrt(at + 0.5)
  return [Math.cos(at * goldenTurn) * reach, Math.sin(at * goldenTurn) * reach]
}

export function spreadStep(zoom: number, previous: number | null): number {
  const level = Math.log2(zoom) * spreadSteps
  if (!Number.isFinite(level)) return previous ?? 0
  if (previous !== null && Math.abs(level - previous) <= 0.5 + stepSlack) return previous
  return Math.round(level)
}

export function stepZoom(step: number): number {
  return 2 ** (step / spreadSteps)
}

export interface PackInput {
  readonly count: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly radius: Float64Array
  readonly scale: Float64Array
  readonly gap: number
}

export interface Packing {
  readonly packs: number
  readonly packOf: Int32Array
  readonly size: Int32Array
  readonly anchorX: Float64Array
  readonly anchorY: Float64Array
  readonly offsetX: Float64Array
  readonly offsetY: Float64Array
}

const coordinates = new Float64Array(2)
const words = new Int32Array(coordinates.buffer)

function tableSize(count: number): number {
  let size = 16
  while (size < count * 2) size *= 2
  return size
}

function pointHash(x: number, y: number): number {
  coordinates[0] = x
  coordinates[1] = y
  const a = Math.imul((words[0] ?? 0) ^ (words[1] ?? 0), 0x9e3779b1)
  const b = Math.imul((words[2] ?? 0) ^ (words[3] ?? 0), 0x85ebca77)
  return (a ^ (b >>> 15) ^ (a >>> 13)) >>> 0
}

function cellHash(cx: number, cy: number): number {
  const hash = Math.imul(cx, primeX) ^ Math.imul(cy, primeY)
  const mixed = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  return (mixed ^ (mixed >>> 13)) >>> 0
}

class Union {
  readonly parent: Int32Array
  sets: number

  constructor(count: number) {
    this.parent = new Int32Array(count)
    this.sets = count
    for (let at = 0; at < count; at++) this.parent[at] = at
  }

  find(at: number): number {
    const parent = this.parent
    let node = at
    while ((parent[node] ?? node) !== node) {
      const above = parent[node] ?? node
      parent[node] = parent[above] ?? above
      node = parent[node] ?? node
    }
    return node
  }

  join(a: number, b: number): boolean {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return false
    if (ra < rb) this.parent[rb] = ra
    else this.parent[ra] = rb
    this.sets--
    return true
  }
}

class Cells {
  readonly count: number
  readonly cellOf: Int32Array
  readonly start: Int32Array
  readonly items: Int32Array
  readonly #keyX: Int32Array
  readonly #keyY: Int32Array
  readonly #slots: Int32Array
  readonly #mask: number

  constructor(length: number, cx: Int32Array, cy: Int32Array) {
    const size = tableSize(length)
    this.#mask = size - 1
    this.#slots = new Int32Array(size).fill(-1)
    this.#keyX = new Int32Array(length)
    this.#keyY = new Int32Array(length)
    this.cellOf = new Int32Array(length)
    let count = 0
    for (let at = 0; at < length; at++) {
      const x = cx[at] ?? 0
      const y = cy[at] ?? 0
      let slot = cellHash(x, y) & this.#mask
      for (;;) {
        const id = this.#slots[slot] ?? -1
        if (id < 0) {
          this.#slots[slot] = count
          this.#keyX[count] = x
          this.#keyY[count] = y
          this.cellOf[at] = count++
          break
        }
        if (this.#keyX[id] === x && this.#keyY[id] === y) {
          this.cellOf[at] = id
          break
        }
        slot = (slot + 1) & this.#mask
      }
    }
    this.count = count
    this.start = new Int32Array(count + 1)
    for (let at = 0; at < length; at++) {
      const id = this.cellOf[at] ?? 0
      this.start[id + 1] = (this.start[id + 1] ?? 0) + 1
    }
    for (let id = 0; id < count; id++) {
      this.start[id + 1] = (this.start[id + 1] ?? 0) + (this.start[id] ?? 0)
    }
    const filled = this.start.slice(0, count)
    this.items = new Int32Array(length)
    for (let at = 0; at < length; at++) {
      const id = this.cellOf[at] ?? 0
      const into = filled[id] ?? 0
      this.items[into] = at
      filled[id] = into + 1
    }
  }

  x(id: number): number {
    return this.#keyX[id] ?? 0
  }

  y(id: number): number {
    return this.#keyY[id] ?? 0
  }

  find(x: number, y: number): number {
    let slot = cellHash(x, y) & this.#mask
    for (;;) {
      const id = this.#slots[slot] ?? -1
      if (id < 0) return -1
      if (this.#keyX[id] === x && this.#keyY[id] === y) return id
      slot = (slot + 1) & this.#mask
    }
  }
}

interface Discs {
  readonly count: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly radius: Float64Array
  readonly scale: Float64Array
}

function gridOf(discs: Discs, cell: number): Cells {
  const { count, x, y } = discs
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  for (let at = 0; at < count; at++) {
    minX = Math.min(minX, x[at] ?? 0)
    minY = Math.min(minY, y[at] ?? 0)
  }
  const cx = new Int32Array(count)
  const cy = new Int32Array(count)
  for (let at = 0; at < count; at++) {
    cx[at] = Math.floor(((x[at] ?? 0) - minX) / cell)
    cy[at] = Math.floor(((y[at] ?? 0) - minY) / cell)
  }
  return new Cells(count, cx, cy)
}

function spanOf(discs: Discs): number {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let at = 0; at < discs.count; at++) {
    minX = Math.min(minX, discs.x[at] ?? 0)
    minY = Math.min(minY, discs.y[at] ?? 0)
    maxX = Math.max(maxX, discs.x[at] ?? 0)
    maxY = Math.max(maxY, discs.y[at] ?? 0)
  }
  return Math.max(maxX - minX, maxY - minY, 0)
}

function touching(discs: Discs, a: number, b: number, gap: number): boolean {
  const dx = (discs.x[a] ?? 0) - (discs.x[b] ?? 0)
  const dy = (discs.y[a] ?? 0) - (discs.y[b] ?? 0)
  const scale = ((discs.scale[a] ?? 0) + (discs.scale[b] ?? 0)) / 2
  return Math.hypot(dx, dy) * scale < (discs.radius[a] ?? 0) + (discs.radius[b] ?? 0) + gap
}

function joinPairs(
  places: Discs,
  grid: Cells,
  a: number,
  b: number,
  gap: number,
  union: Union,
  auto: boolean,
): void {
  const { start, items } = grid
  for (let i = start[a] ?? 0; i < (start[a + 1] ?? 0); i++) {
    const p = items[i] ?? 0
    for (let j = a === b ? i + 1 : (start[b] ?? 0); j < (start[b + 1] ?? 0); j++) {
      const q = items[j] ?? 0
      if (union.find(p) === union.find(q)) continue
      if (!touching(places, p, q, gap)) continue
      union.join(p, q)
      if (auto) return
    }
  }
}

function joinPlaces(places: Discs, gap: number, union: Union): void {
  const { count, radius, scale } = places
  if (count < 2) return
  let rMin = Number.POSITIVE_INFINITY
  let rMax = 0
  let sMin = Number.POSITIVE_INFINITY
  let sMax = 0
  for (let at = 0; at < count; at++) {
    rMin = Math.min(rMin, radius[at] ?? 0)
    rMax = Math.max(rMax, radius[at] ?? 0)
    sMin = Math.min(sMin, scale[at] ?? 0)
    sMax = Math.max(sMax, scale[at] ?? 0)
  }
  const reachMax = (2 * rMax + gap) / sMin
  const reachMin = (2 * rMin + gap) / sMax
  if (!(reachMax > 0) || !Number.isFinite(reachMax)) return
  let auto = reachMin > 0 && reachMin * radiusRatio >= reachMax
  let cell = Math.max(reachMin, reachMax / radiusRatio) / Math.SQRT2
  if (spanOf(places) / cell > cellLimit) {
    cell = spanOf(places) / cellLimit
    auto = false
  }
  const grid = gridOf(places, cell)
  const { start, items } = grid
  const widest = new Float64Array(grid.count)
  const least = new Float64Array(grid.count).fill(Number.POSITIVE_INFINITY)
  const box = new Float64Array(grid.count * 4)
  for (let id = 0; id < grid.count; id++) {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const first = items[start[id] ?? 0] ?? 0
    for (let at = start[id] ?? 0; at < (start[id + 1] ?? 0); at++) {
      const place = items[at] ?? 0
      const px = places.x[place] ?? 0
      const py = places.y[place] ?? 0
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
      widest[id] = Math.max(widest[id] ?? 0, radius[place] ?? 0)
      least[id] = Math.min(least[id] ?? 0, scale[place] ?? 0)
      if (auto) union.join(first, place)
    }
    box[id * 4] = minX
    box[id * 4 + 1] = minY
    box[id * 4 + 2] = maxX
    box[id * 4 + 3] = maxY
  }
  for (let a = 0; a < grid.count && union.sets > 1; a++) {
    if (!auto) joinPairs(places, grid, a, a, gap, union, false)
    const ra = widest[a] ?? 0
    const range = Math.max(1, Math.ceil((2 * ra + gap) / sMin / cell))
    const ax = grid.x(a)
    const ay = grid.y(a)
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (dx === 0 && dy === 0) continue
        const b = grid.find(ax + dx, ay + dy)
        if (b < 0) continue
        const rb = widest[b] ?? 0
        if (rb > ra || (rb === ra && b < a)) continue
        const firstA = items[start[a] ?? 0] ?? 0
        const firstB = items[start[b] ?? 0] ?? 0
        if (auto && union.find(firstA) === union.find(firstB)) continue
        const apart = Math.hypot(
          Math.max(0, (box[b * 4] ?? 0) - (box[a * 4 + 2] ?? 0)) +
            Math.max(0, (box[a * 4] ?? 0) - (box[b * 4 + 2] ?? 0)),
          Math.max(0, (box[b * 4 + 1] ?? 0) - (box[a * 4 + 3] ?? 0)) +
            Math.max(0, (box[a * 4 + 1] ?? 0) - (box[b * 4 + 3] ?? 0)),
        )
        if (apart * Math.min(least[a] ?? 0, least[b] ?? 0) >= ra + rb + gap) continue
        joinPairs(places, grid, a, b, gap, union, auto)
      }
    }
  }
}

function median(values: Float64Array): number {
  if (values.length === 0) return 0
  const sorted = Float64Array.from(values).sort()
  return sorted[sorted.length >> 1] ?? 0
}

function overlaps(discs: Discs, gap: number, union: Union): boolean {
  const { count, radius, scale } = discs
  if (count < 2) return false
  let sMin = Number.POSITIVE_INFINITY
  for (let at = 0; at < count; at++) sMin = Math.min(sMin, scale[at] ?? 0)
  const cell = (2 * median(radius) + gap) / sMin
  if (!(cell > 0) || !Number.isFinite(cell)) return false
  const span = spanOf(discs)
  const size = Math.max(cell, span / cellLimit)
  const grid = gridOf(discs, size)
  const { cellOf, start, items } = grid
  let found = false
  for (let a = 0; a < count; a++) {
    const reach = (2 * (radius[a] ?? 0) + gap) / sMin
    const range = Math.max(1, Math.ceil(reach / size))
    const home = cellOf[a] ?? 0
    const hx = grid.x(home)
    const hy = grid.y(home)
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const id = grid.find(hx + dx, hy + dy)
        if (id < 0) continue
        for (let at = start[id] ?? 0; at < (start[id + 1] ?? 0); at++) {
          const b = items[at] ?? 0
          const rb = radius[b] ?? 0
          const ra = radius[a] ?? 0
          if (b === a || rb > ra || (rb === ra && b > a)) continue
          if (!touching(discs, a, b, gap)) continue
          if (union.join(a, b)) found = true
        }
      }
    }
  }
  return found
}

interface Arrangement extends Packing {
  readonly reach: Float64Array
  readonly scale: Float64Array
}

function arrange(
  input: PackInput,
  places: number,
  rootOf: (member: number) => number,
): Arrangement {
  const { count, x, y, radius, scale, gap } = input
  const packOf = new Int32Array(count).fill(-1)
  const idOf = new Int32Array(places).fill(-1)
  let packs = 0
  for (let member = 0; member < count; member++) {
    const root = rootOf(member)
    if (root < 0) continue
    let id = idOf[root] ?? -1
    if (id < 0) {
      id = packs++
      idOf[root] = id
    }
    packOf[member] = id
  }
  const size = new Int32Array(packs)
  const anchorX = new Float64Array(packs)
  const anchorY = new Float64Array(packs)
  const widest = new Float64Array(packs)
  const packScale = new Float64Array(packs)
  for (let member = 0; member < count; member++) {
    const id = packOf[member] ?? -1
    if (id < 0) continue
    size[id] = (size[id] ?? 0) + 1
    anchorX[id] = (anchorX[id] ?? 0) + (x[member] ?? 0)
    anchorY[id] = (anchorY[id] ?? 0) + (y[member] ?? 0)
    packScale[id] = (packScale[id] ?? 0) + (scale[member] ?? 0)
    widest[id] = Math.max(widest[id] ?? 0, radius[member] ?? 0)
  }
  for (let id = 0; id < packs; id++) {
    const n = size[id] ?? 1
    anchorX[id] = (anchorX[id] ?? 0) / n
    anchorY[id] = (anchorY[id] ?? 0) / n
    packScale[id] = (packScale[id] ?? 0) / n
  }
  const offsetX = new Float64Array(count)
  const offsetY = new Float64Array(count)
  const rank = new Int32Array(packs)
  const reach = new Float64Array(packs)
  for (let member = 0; member < count; member++) {
    const id = packOf[member] ?? -1
    if (id < 0) continue
    const at = rank[id] ?? 0
    rank[id] = at + 1
    const [dx, dy] = offsetAt(at, size[id] ?? 1, 2 * (widest[id] ?? 0) + gap)
    offsetX[member] = dx
    offsetY[member] = dy
    reach[id] = Math.max(reach[id] ?? 0, Math.hypot(dx, dy) + (radius[member] ?? 0))
  }
  return { packs, packOf, size, anchorX, anchorY, offsetX, offsetY, reach, scale: packScale }
}

export function packMembers(input: PackInput, rounds: number = spreadRounds, join = true): Packing {
  const { count, x, y, radius, scale, gap } = input
  const placeOf = new Int32Array(count).fill(-1)
  const table = new Int32Array(tableSize(count)).fill(-1)
  const mask = table.length - 1
  const px = new Float64Array(count)
  const py = new Float64Array(count)
  const pr = new Float64Array(count)
  const ps = new Float64Array(count)
  let places = 0
  for (let member = 0; member < count; member++) {
    const mx = (x[member] ?? Number.NaN) + 0
    const my = (y[member] ?? Number.NaN) + 0
    if (!Number.isFinite(mx) || !Number.isFinite(my)) continue
    let slot = pointHash(mx, my) & mask
    for (;;) {
      const id = table[slot] ?? -1
      if (id < 0) {
        table[slot] = places
        px[places] = mx
        py[places] = my
        pr[places] = radius[member] ?? 0
        ps[places] = scale[member] ?? 1
        placeOf[member] = places++
        break
      }
      if (px[id] === mx && py[id] === my) {
        placeOf[member] = id
        pr[id] = Math.max(pr[id] ?? 0, radius[member] ?? 0)
        break
      }
      slot = (slot + 1) & mask
    }
  }
  const union = new Union(places)
  if (join)
    joinPlaces(
      {
        count: places,
        x: px.subarray(0, places),
        y: py.subarray(0, places),
        radius: pr.subarray(0, places),
        scale: ps.subarray(0, places),
      },
      gap,
      union,
    )
  const rootOf = (member: number) => {
    const place = placeOf[member] ?? -1
    return place < 0 ? -1 : union.find(place)
  }
  let packing = arrange(input, places, rootOf)
  for (let round = 0; round < rounds; round++) {
    const discs: Discs = {
      count: packing.packs,
      x: packing.anchorX,
      y: packing.anchorY,
      radius: packing.reach,
      scale: packing.scale,
    }
    const merged = new Union(packing.packs)
    if (!overlaps(discs, gap, merged)) break
    const firstPlace = new Int32Array(packing.packs).fill(-1)
    for (let member = 0; member < count; member++) {
      const id = packing.packOf[member] ?? -1
      if (id < 0) continue
      const place = placeOf[member] ?? -1
      const into = merged.find(id)
      const lead = firstPlace[into] ?? -1
      if (lead < 0) firstPlace[into] = place
      else union.join(lead, place)
    }
    packing = arrange(input, places, rootOf)
  }
  const { packs, packOf, size, anchorX, anchorY, offsetX, offsetY } = packing
  return { packs, packOf, size, anchorX, anchorY, offsetX, offsetY }
}
