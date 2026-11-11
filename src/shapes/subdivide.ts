import { geoStep } from '../core/edge-waypoints'
import type { ShapeGeometryData } from '../core/shape-engine'

const edgeBase = 2 ** 26
const triangleLimit = 1 << 22
const pathLimit = 1 << 16

function edgeKey(a: number, b: number): number {
  return a < b ? a * edgeBase + b : b * edgeBase + a
}

class Mesh {
  readonly xs: number[]
  readonly a: number[] = []
  readonly b: number[] = []
  readonly c: number[] = []
  readonly #first = new Map<number, number>()
  readonly #second = new Map<number, number>()
  readonly mids = new Map<number, number>()
  readonly #limit: number

  constructor(points: Float64Array, triangles: Uint32Array, step: number) {
    this.xs = Array.from(points)
    this.#limit = step * step
    for (let k = 0; k + 2 < triangles.length; k += 3) {
      this.#add(triangles[k] ?? 0, triangles[k + 1] ?? 0, triangles[k + 2] ?? 0)
    }
  }

  get count(): number {
    return this.a.length
  }

  #length(u: number, v: number): number {
    const dx = (this.xs[u * 2] ?? 0) - (this.xs[v * 2] ?? 0)
    const dy = (this.xs[u * 2 + 1] ?? 0) - (this.xs[v * 2 + 1] ?? 0)
    return dx * dx + dy * dy
  }

  #add(a: number, b: number, c: number): number {
    const t = this.a.length
    this.a.push(a)
    this.b.push(b)
    this.c.push(c)
    this.#link(t)
    return t
  }

  #edges(t: number): [number, number, number, number, number, number] {
    const a = this.a[t] ?? 0
    const b = this.b[t] ?? 0
    const c = this.c[t] ?? 0
    return [a, b, b, c, c, a]
  }

  #link(t: number): void {
    const e = this.#edges(t)
    for (let k = 0; k < 6; k += 2) {
      const key = edgeKey(e[k] ?? 0, e[k + 1] ?? 0)
      if (this.#first.has(key)) this.#second.set(key, t)
      else this.#first.set(key, t)
    }
  }

  #unlink(t: number): void {
    const e = this.#edges(t)
    for (let k = 0; k < 6; k += 2) {
      const key = edgeKey(e[k] ?? 0, e[k + 1] ?? 0)
      if (this.#second.get(key) === t) this.#second.delete(key)
      else if (this.#first.get(key) === t) {
        const other = this.#second.get(key)
        if (other === undefined) this.#first.delete(key)
        else {
          this.#first.set(key, other)
          this.#second.delete(key)
        }
      }
    }
  }

  #neighbor(t: number, key: number): number {
    const first = this.#first.get(key)
    if (first === undefined) return -1
    if (first !== t) return first
    return this.#second.get(key) ?? -1
  }

  longest(t: number): readonly [u: number, v: number, w: number, length: number, key: number] {
    const e = this.#edges(t)
    let best = 0
    let bestLength = -1
    let bestKey = -1
    for (let k = 0; k < 6; k += 2) {
      const u = e[k] ?? 0
      const v = e[k + 1] ?? 0
      const length = this.#length(u, v)
      const key = edgeKey(u, v)
      if (length > bestLength || (length === bestLength && key > bestKey)) {
        best = k
        bestLength = length
        bestKey = key
      }
    }
    const u = e[best] ?? 0
    const v = e[best + 1] ?? 0
    const w = e[(best + 4) % 6] ?? 0
    return [u, v, w, bestLength, bestKey]
  }

  coarse(t: number): boolean {
    return this.longest(t)[3] > this.#limit
  }

  #midpoint(u: number, v: number, key: number): number {
    const known = this.mids.get(key)
    if (known !== undefined) return known
    const m = this.xs.length / 2
    this.xs.push(
      ((this.xs[u * 2] ?? 0) + (this.xs[v * 2] ?? 0)) / 2,
      ((this.xs[u * 2 + 1] ?? 0) + (this.xs[v * 2 + 1] ?? 0)) / 2,
    )
    this.mids.set(key, m)
    return m
  }

  #split(t: number, u: number, v: number, m: number): void {
    const a = this.a[t] ?? 0
    const b = this.b[t] ?? 0
    const c = this.c[t] ?? 0
    const w = a !== u && a !== v ? a : b !== u && b !== v ? b : c
    const forward = (a === u && b === v) || (b === u && c === v) || (c === u && a === v)
    this.#unlink(t)
    if (forward) {
      this.a[t] = u
      this.b[t] = m
      this.c[t] = w
      this.#link(t)
      this.#add(m, v, w)
    } else {
      this.a[t] = v
      this.b[t] = m
      this.c[t] = w
      this.#link(t)
      this.#add(m, u, w)
    }
  }

  bisect(t: number): void {
    let current = t
    for (let walked = 0; ; walked++) {
      const [u, v, , , key] = this.longest(current)
      const other = this.#neighbor(current, key)
      if (other < 0 || walked > pathLimit) {
        this.#split(current, u, v, this.#midpoint(u, v, key))
        return
      }
      if (this.longest(other)[4] === key) {
        const m = this.#midpoint(u, v, key)
        this.#split(current, u, v, m)
        this.#split(other, u, v, m)
        return
      }
      current = other
    }
  }
}

function refine(points: Float64Array, triangles: Uint32Array, step: number): Mesh {
  const mesh = new Mesh(points, triangles, step)
  const queue: number[] = []
  for (let t = 0; t < mesh.count; t++) if (mesh.coarse(t)) queue.push(t)
  while (queue.length > 0 && mesh.count < triangleLimit) {
    const t = queue.pop() ?? 0
    while (mesh.coarse(t) && mesh.count < triangleLimit) {
      const before = mesh.count
      mesh.bisect(t)
      for (let added = before; added < mesh.count; added++) {
        if (mesh.coarse(added)) queue.push(added)
      }
    }
  }
  return mesh
}

class Output {
  readonly xs: number[] = []
  readonly rings: number[] = []
  readonly #index = new Map<number, number>()
  readonly #source: number[]
  readonly #mids: Map<number, number> | null
  readonly #step: number

  constructor(source: number[], mids: Map<number, number> | null, step: number) {
    this.#source = source
    this.#mids = mids
    this.#step = step
  }

  #emit(vertex: number): void {
    const at = this.xs.length / 2
    if (!this.#index.has(vertex)) this.#index.set(vertex, at)
    this.xs.push(this.#source[vertex * 2] ?? 0, this.#source[vertex * 2 + 1] ?? 0)
  }

  #between(u: number, v: number): void {
    const m = this.#mids?.get(edgeKey(u, v))
    if (m !== undefined) {
      this.#between(u, m)
      this.#emit(m)
      this.#between(m, v)
      return
    }
    const ux = this.#source[u * 2] ?? 0
    const uy = this.#source[u * 2 + 1] ?? 0
    const vx = this.#source[v * 2] ?? 0
    const vy = this.#source[v * 2 + 1] ?? 0
    const pieces = Math.ceil(Math.hypot(vx - ux, vy - uy) / this.#step)
    for (let k = 1; k < pieces; k++) {
      this.xs.push(ux + ((vx - ux) * k) / pieces, uy + ((vy - uy) * k) / pieces)
    }
  }

  ring(from: number, to: number, closed: boolean): void {
    for (let k = from; k < to; k++) {
      this.#emit(k)
      const next = k + 1 < to ? k + 1 : closed ? from : -1
      if (next >= 0) this.#between(k, next)
    }
    this.rings.push(this.xs.length / 2)
  }

  indexOf(vertex: number): number {
    const known = this.#index.get(vertex)
    if (known !== undefined) return known
    const at = this.xs.length / 2
    this.#index.set(vertex, at)
    this.xs.push(this.#source[vertex * 2] ?? 0, this.#source[vertex * 2 + 1] ?? 0)
    return at
  }
}

function longer(points: Float64Array, u: number, v: number, limit: number): boolean {
  const dx = (points[u * 2] ?? 0) - (points[v * 2] ?? 0)
  const dy = (points[u * 2 + 1] ?? 0) - (points[v * 2 + 1] ?? 0)
  return dx * dx + dy * dy > limit
}

function coarseTriangles(points: Float64Array, triangles: Uint32Array, limit: number): boolean {
  for (let k = 0; k + 2 < triangles.length; k += 3) {
    const a = triangles[k] ?? 0
    const b = triangles[k + 1] ?? 0
    const c = triangles[k + 2] ?? 0
    if (longer(points, a, b, limit) || longer(points, b, c, limit) || longer(points, c, a, limit)) {
      return true
    }
  }
  return false
}

function coarseRings(geometry: ShapeGeometryData, limit: number): boolean {
  const { points, rings, closed } = geometry
  let start = 0
  for (const end of rings) {
    for (let k = start; k < end; k++) {
      const next = k + 1 < end ? k + 1 : closed ? start : -1
      if (next >= 0 && longer(points, k, next, limit)) return true
    }
    start = end
  }
  return false
}

export function subdivide(geometry: ShapeGeometryData, step: number): ShapeGeometryData {
  if (geometry.round) return geometry
  const { points, rings, triangles, closed } = geometry
  if (Math.hypot(geometry.maxX - geometry.minX, geometry.maxY - geometry.minY) <= step) {
    return geometry
  }
  const limit = step * step
  const fills = coarseTriangles(points, triangles, limit)
  if (!fills && !coarseRings(geometry, limit)) return geometry
  const mesh = fills ? refine(points, triangles, step) : null
  const out = new Output(mesh ? mesh.xs : Array.from(points), mesh?.mids ?? null, step)
  let start = 0
  for (const end of rings) {
    out.ring(start, end, closed)
    start = end
  }
  let corners: Uint32Array
  if (mesh) {
    corners = new Uint32Array(mesh.count * 3)
    for (let t = 0; t < mesh.count; t++) {
      corners[t * 3] = out.indexOf(mesh.a[t] ?? 0)
      corners[t * 3 + 1] = out.indexOf(mesh.b[t] ?? 0)
      corners[t * 3 + 2] = out.indexOf(mesh.c[t] ?? 0)
    }
  } else {
    corners = new Uint32Array(triangles.length)
    for (let k = 0; k < triangles.length; k++) corners[k] = out.indexOf(triangles[k] ?? 0)
  }
  return {
    ...geometry,
    points: new Float64Array(out.xs),
    rings: new Uint32Array(out.rings),
    triangles: corners,
  }
}

const cache = new WeakMap<ShapeGeometryData, ShapeGeometryData>()

export function onSphere(geometry: ShapeGeometryData): ShapeGeometryData {
  const known = cache.get(geometry)
  if (known) return known
  const made = subdivide(geometry, geoStep)
  cache.set(geometry, made)
  return made
}
