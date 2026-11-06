export const outlineStride = 5

const arcStep = (Math.PI * 2) / 72
const smoothBend = (Math.PI / 180) * 24
const straightBend = (Math.PI / 180) * 0.5
const diskSamples = 8
const epsilon = 1e-9

export type OutlineShape = 'rounded' | 'smooth'

export class Outline {
  data: Float32Array = new Float32Array(64 * outlineStride)
  length = 0

  clear(): void {
    this.length = 0
  }

  push(qx: number, qy: number, nx: number, ny: number, offset: number): void {
    const at = this.length * outlineStride
    if (at + outlineStride > this.data.length) {
      const grown = new Float32Array(this.data.length * 2)
      grown.set(this.data)
      this.data = grown
    }
    this.data[at] = qx
    this.data[at + 1] = qy
    this.data[at + 2] = nx
    this.data[at + 3] = ny
    this.data[at + 4] = offset
    this.length++
  }
}

export class HullScratch {
  x: Float64Array = new Float64Array(0)
  y: Float64Array = new Float64Array(0)
  r: Float64Array = new Float64Array(0)
  order: Uint32Array = new Uint32Array(0)
  hull: Uint32Array = new Uint32Array(0)
  owner: Uint32Array = new Uint32Array(0)
  count = 0

  reserve(count: number): void {
    if (count <= this.x.length) return
    const size = Math.max(count, this.x.length * 2, 16)
    this.x = new Float64Array(size)
    this.y = new Float64Array(size)
    this.r = new Float64Array(size)
    this.order = new Uint32Array(size)
    this.hull = new Uint32Array(size * 2 + 2)
    this.owner = new Uint32Array(size)
  }
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function prefilter(x: Float64Array, y: Float64Array, count: number, order: Uint32Array): number {
  const extremes = [0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 1; i < count; i++) {
    const px = x[i] ?? 0
    const py = y[i] ?? 0
    const at = (k: number) => extremes[k] ?? 0
    if (px > (x[at(0)] ?? 0)) extremes[0] = i
    if (px + py > (x[at(1)] ?? 0) + (y[at(1)] ?? 0)) extremes[1] = i
    if (py > (y[at(2)] ?? 0)) extremes[2] = i
    if (py - px > (y[at(3)] ?? 0) - (x[at(3)] ?? 0)) extremes[3] = i
    if (px < (x[at(4)] ?? 0)) extremes[4] = i
    if (px + py < (x[at(5)] ?? 0) + (y[at(5)] ?? 0)) extremes[5] = i
    if (py < (y[at(6)] ?? 0)) extremes[6] = i
    if (py - px < (y[at(7)] ?? 0) - (x[at(7)] ?? 0)) extremes[7] = i
  }
  const corners: number[] = []
  for (const index of extremes) if (corners[corners.length - 1] !== index) corners.push(index)
  while (corners.length > 1 && corners[0] === corners[corners.length - 1]) corners.pop()
  if (corners.length < 3) {
    for (let i = 0; i < count; i++) order[i] = i
    return count
  }
  let kept = 0
  for (let i = 0; i < count; i++) {
    const px = x[i] ?? 0
    const py = y[i] ?? 0
    let inside = true
    for (let k = 0; k < corners.length; k++) {
      const a = corners[k] ?? 0
      const b = corners[(k + 1) % corners.length] ?? 0
      if (cross(x[a] ?? 0, y[a] ?? 0, x[b] ?? 0, y[b] ?? 0, px, py) <= 0) {
        inside = false
        break
      }
    }
    if (!inside) order[kept++] = i
  }
  return kept
}

export function convexHull(
  x: Float64Array,
  y: Float64Array,
  count: number,
  order: Uint32Array,
  hull: Uint32Array,
): number {
  if (count === 0) return 0
  const kept = prefilter(x, y, count, order)
  const sorted = order.subarray(0, kept)
  sorted.sort((a, b) => (x[a] ?? 0) - (x[b] ?? 0) || (y[a] ?? 0) - (y[b] ?? 0))
  let size = 0
  const turn = (k: number) => {
    const a = hull[size - 2] ?? 0
    const b = hull[size - 1] ?? 0
    return cross(x[a] ?? 0, y[a] ?? 0, x[b] ?? 0, y[b] ?? 0, x[k] ?? 0, y[k] ?? 0)
  }
  for (let i = 0; i < kept; i++) {
    const k = sorted[i] ?? 0
    while (size >= 2 && turn(k) <= epsilon) size--
    hull[size++] = k
  }
  const lower = size + 1
  for (let i = kept - 2; i >= 0; i--) {
    const k = sorted[i] ?? 0
    while (size >= lower && turn(k) <= epsilon) size--
    hull[size++] = k
  }
  if (size > 1) size--
  if (size === 2 && (x[hull[0] ?? 0] ?? 0) === (x[hull[1] ?? 0] ?? 0)) {
    if ((y[hull[0] ?? 0] ?? 0) === (y[hull[1] ?? 0] ?? 0)) size = 1
  }
  return size
}

function arc(
  out: Outline,
  qx: number,
  qy: number,
  from: number,
  turn: number,
  offset: number,
): void {
  const steps = Math.max(1, Math.ceil(turn / arcStep))
  for (let k = 0; k <= steps; k++) {
    const angle = from + (turn * k) / steps
    out.push(qx, qy, Math.cos(angle), Math.sin(angle), offset)
  }
}

function circle(out: Outline, qx: number, qy: number, offset: number): void {
  const steps = Math.round((Math.PI * 2) / arcStep)
  for (let k = 0; k < steps; k++) {
    const angle = (k / steps) * Math.PI * 2
    out.push(qx, qy, Math.cos(angle), Math.sin(angle), offset)
  }
}

function positiveTurn(from: number, to: number): number {
  let turn = to - from
  while (turn < 0) turn += Math.PI * 2
  while (turn >= Math.PI * 2) turn -= Math.PI * 2
  return turn
}

const unitCircle = Float64Array.from({ length: diskSamples * 2 }, (_, i) => {
  const angle = (Math.floor(i / 2) / diskSamples) * Math.PI * 2
  return i % 2 === 0 ? Math.cos(angle) : Math.sin(angle)
})

const samples = new HullScratch()

function diskSequence(scratch: HullScratch, hullSize: number): number[] {
  const { x, y, r, hull } = scratch
  const vertices = Array.from(hull.subarray(0, hullSize))
  let minRadius = Number.POSITIVE_INFINITY
  let uniform = true
  for (const v of vertices) {
    const radius = r[v] ?? 0
    if (minRadius !== Number.POSITIVE_INFINITY && Math.abs(radius - minRadius) > epsilon) {
      uniform = false
    }
    minRadius = Math.min(minRadius, radius)
  }
  const candidates = new Set(vertices)
  const edges: number[] = []
  if (hullSize >= 3) {
    for (let k = 0; k < hullSize; k++) {
      const a = vertices[k] ?? 0
      const b = vertices[(k + 1) % hullSize] ?? 0
      const dx = (x[b] ?? 0) - (x[a] ?? 0)
      const dy = (y[b] ?? 0) - (y[a] ?? 0)
      const length = Math.hypot(dx, dy)
      if (length < epsilon) continue
      const nx = -dy / length
      const ny = dx / length
      edges.push(nx, ny, nx * (x[a] ?? 0) + ny * (y[a] ?? 0))
    }
  }
  for (let i = 0; i < scratch.count; i++) {
    const excess = (r[i] ?? 0) - minRadius
    if (excess <= epsilon || candidates.has(i)) continue
    const px = x[i] ?? 0
    const py = y[i] ?? 0
    let near = edges.length === 0
    for (let e = 0; e < edges.length && !near; e += 3) {
      near = (edges[e] ?? 0) * px + (edges[e + 1] ?? 0) * py - (edges[e + 2] ?? 0) < excess
    }
    if (near) candidates.add(i)
  }
  if (uniform && candidates.size === vertices.length) return vertices
  const owners = [...candidates]
  const total = owners.length * diskSamples
  const points = samples
  points.reserve(total)
  let count = 0
  for (const owner of owners) {
    const radius = r[owner] ?? 0
    for (let k = 0; k < diskSamples; k++) {
      points.x[count] = (x[owner] ?? 0) + (unitCircle[k * 2] ?? 0) * radius
      points.y[count] = (y[owner] ?? 0) + (unitCircle[k * 2 + 1] ?? 0) * radius
      points.owner[count] = owner
      count++
    }
  }
  const size = convexHull(points.x, points.y, count, points.order, points.hull)
  const sequence: number[] = []
  for (let k = 0; k < size; k++) {
    const owner = points.owner[points.hull[k] ?? 0] ?? 0
    if (sequence[sequence.length - 1] !== owner) sequence.push(owner)
  }
  while (sequence.length > 1 && sequence[0] === sequence[sequence.length - 1]) sequence.pop()
  return sequence
}

function tangentAngle(scratch: HullScratch, a: number, b: number): number | null {
  const dx = (scratch.x[b] ?? 0) - (scratch.x[a] ?? 0)
  const dy = (scratch.y[b] ?? 0) - (scratch.y[a] ?? 0)
  const length = Math.hypot(dx, dy)
  if (length < epsilon) return null
  const s = ((scratch.r[a] ?? 0) - (scratch.r[b] ?? 0)) / length
  if (Math.abs(s) >= 1) return null
  const ex = dx / length
  const ey = dy / length
  const c = Math.sqrt(1 - s * s)
  return Math.atan2(s * ey - c * ex, s * ex + c * ey)
}

function roundedOutline(scratch: HullScratch, hullSize: number, out: Outline): void {
  let sequence = diskSequence(scratch, hullSize)
  let angles: (number | null)[] = []
  for (let attempt = 0; attempt < 8; attempt++) {
    angles = sequence.map((disk, k) =>
      tangentAngle(scratch, disk, sequence[(k + 1) % sequence.length] ?? disk),
    )
    const broken = sequence.length > 1 ? angles.indexOf(null) : -1
    if (broken < 0) break
    const a = sequence[broken] ?? 0
    const b = sequence[(broken + 1) % sequence.length] ?? 0
    const drop = (scratch.r[a] ?? 0) < (scratch.r[b] ?? 0) ? broken : (broken + 1) % sequence.length
    sequence = sequence.filter((_, k) => k !== drop)
  }
  const { x, y, r } = scratch
  if (sequence.length === 1) {
    const disk = sequence[0] ?? 0
    circle(out, x[disk] ?? 0, y[disk] ?? 0, r[disk] ?? 0)
    return
  }
  sequence.forEach((disk, k) => {
    const incoming = angles[(k + sequence.length - 1) % sequence.length] ?? 0
    const outgoing = angles[k] ?? 0
    const turn = positiveTurn(incoming, outgoing)
    if (turn > Math.PI * 2 - 1e-6 || turn < 1e-6) {
      out.push(x[disk] ?? 0, y[disk] ?? 0, Math.cos(outgoing), Math.sin(outgoing), r[disk] ?? 0)
      return
    }
    arc(out, x[disk] ?? 0, y[disk] ?? 0, incoming, turn, r[disk] ?? 0)
  })
}

function smoothOutline(scratch: HullScratch, hullSize: number, out: Outline): void {
  const { x, y, r, hull } = scratch
  let radius = 0
  for (let i = 0; i < scratch.count; i++) radius = Math.max(radius, r[i] ?? 0)
  if (hullSize === 1) {
    const v = hull[0] ?? 0
    circle(out, x[v] ?? 0, y[v] ?? 0, radius)
    return
  }
  const directions: number[] = []
  for (let k = 0; k < hullSize; k++) {
    const a = hull[k] ?? 0
    const b = hull[(k + 1) % hullSize] ?? 0
    directions.push(Math.atan2((y[b] ?? 0) - (y[a] ?? 0), (x[b] ?? 0) - (x[a] ?? 0)))
  }
  const exterior = directions.map((direction, k) =>
    positiveTurn(directions[(k + hullSize - 1) % hullSize] ?? 0, direction),
  )
  const bends = directions.map((_, k) =>
    Math.min(smoothBend, (exterior[k] ?? 0) / 2, (exterior[(k + 1) % hullSize] ?? 0) / 2),
  )
  for (let k = 0; k < hullSize; k++) {
    const v = hull[k] ?? 0
    const vx = x[v] ?? 0
    const vy = y[v] ?? 0
    const previous = (k + hullSize - 1) % hullSize
    const previousBend = (bends[previous] ?? 0) > straightBend ? (bends[previous] ?? 0) : 0
    const bend = (bends[k] ?? 0) > straightBend ? (bends[k] ?? 0) : 0
    const from = (directions[previous] ?? 0) - Math.PI / 2 + previousBend
    arc(out, vx, vy, from, Math.max(0, (exterior[k] ?? 0) - previousBend - bend), radius)
    if (bend === 0) continue
    const w = hull[(k + 1) % hullSize] ?? 0
    const dx = (x[w] ?? 0) - vx
    const dy = (y[w] ?? 0) - vy
    const length = Math.hypot(dx, dy)
    const circle = length / (2 * Math.sin(bend))
    const normal = (directions[k] ?? 0) - Math.PI / 2
    const ox = vx + dx / 2 - Math.cos(normal) * circle * Math.cos(bend)
    const oy = vy + dy / 2 - Math.sin(normal) * circle * Math.cos(bend)
    const steps = Math.max(2, Math.ceil((bend * 2) / arcStep))
    for (let step = 1; step < steps; step++) {
      const angle = normal - bend + (bend * 2 * step) / steps
      const nx = Math.cos(angle)
      const ny = Math.sin(angle)
      out.push(ox + nx * circle, oy + ny * circle, nx, ny, radius)
    }
  }
}

export function hullOutline(scratch: HullScratch, shape: OutlineShape, out: Outline): void {
  out.clear()
  if (scratch.count === 0) return
  const size = convexHull(scratch.x, scratch.y, scratch.count, scratch.order, scratch.hull)
  if (shape === 'smooth') smoothOutline(scratch, size, out)
  else roundedOutline(scratch, size, out)
}
