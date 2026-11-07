import { containerShape, type NodeColumns } from './columns'

export interface Outline {
  x: number
  y: number
  shape: number
  radius: number
  halfWidth: number
  halfHeight: number
  trim: number
}

export const squareShare = 0.86
export const diamondShare = 1.2
export const maxStations = 33

const arcSteps = 8
const searchSteps = 24
const tiny = 1e-9

export function nodeOutline(
  nodes: NodeColumns,
  boxes: Float32Array | null,
  index: number,
  x: number,
  y: number,
  zoom: number,
  out: Outline,
): Outline {
  const size = nodes.size[index] ?? 0
  const screen = nodes.screenUnits[index] === 1
  const scale = zoom > 0 ? zoom : 1
  const radius = Math.max((screen ? size : size * scale) / 2, 1.25) / scale
  const shape = nodes.shape[index] ?? 0
  out.x = x
  out.y = y
  out.shape = shape
  out.radius = radius
  out.trim = radius
  if (shape === containerShape && boxes) {
    out.halfWidth = boxes[index * 4] ?? radius
    out.halfHeight = boxes[index * 4 + 1] ?? radius
  } else {
    const half = shape === 1 ? radius * squareShare : shape === 2 ? radius * diamondShare : radius
    out.halfWidth = half
    out.halfHeight = half
  }
  return out
}

function inside(outline: Outline, x: number, y: number): boolean {
  const dx = Math.abs(x - outline.x)
  const dy = Math.abs(y - outline.y)
  if (outline.shape === 0) return dx * dx + dy * dy < outline.radius * outline.radius
  if (outline.shape === 2) return dx + dy < outline.radius * diamondShare
  return dx < outline.halfWidth && dy < outline.halfHeight
}

function exit(
  outline: Outline,
  x: number,
  y: number,
  ux: number,
  uy: number,
  limit: number,
): number {
  if (!inside(outline, x, y)) return 0
  let lo = 0
  let hi = limit
  if (inside(outline, x + ux * hi, y + uy * hi)) return hi
  for (let step = 0; step < searchSteps; step++) {
    const mid = (lo + hi) / 2
    if (inside(outline, x + ux * mid, y + uy * mid)) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface RouteShape {
  xs: number[]
  ys: number[]
  count: number
  room: number
}

function attach(xs: number[], ys: number[], outline: Outline, at: number, toward: number): void {
  const x = xs[at] ?? 0
  const y = ys[at] ?? 0
  const dx = (xs[toward] ?? 0) - x
  const dy = (ys[toward] ?? 0) - y
  const length = Math.hypot(dx, dy)
  if (length < tiny) return
  const ux = dx / length
  const uy = dy / length
  const t = exit(outline, x, y, ux, uy, length)
  xs[at] = x + ux * (t - outline.trim)
  ys[at] = y + uy * (t - outline.trim)
}

function build(
  px: readonly number[],
  py: readonly number[],
  radius: number,
  steps: number,
  start: Outline,
  end: Outline,
  shape: RouteShape,
): void {
  const m = px.length - 1
  const xs: number[] = [px[0] ?? 0]
  const ys: number[] = [py[0] ?? 0]
  const pieces: number[] = [0]
  for (let k = 1; k < m; k++) {
    const x = px[k] ?? 0
    const y = py[k] ?? 0
    const ax = (px[k - 1] ?? 0) - x
    const ay = (py[k - 1] ?? 0) - y
    const bx = (px[k + 1] ?? 0) - x
    const by = (py[k + 1] ?? 0) - y
    const la = Math.hypot(ax, ay)
    const lb = Math.hypot(bx, by)
    const before = k === 1 ? Math.max(0, la - start.trim) : la / 2
    const after = k === m - 1 ? Math.max(0, lb - end.trim) : lb / 2
    const reach = Math.min(radius, before, after)
    if (steps === 0 || reach < tiny || la < tiny || lb < tiny) {
      xs.push(x)
      ys.push(y)
      pieces.push(xs.length - 1, xs.length - 1)
      continue
    }
    const uax = ax / la
    const uay = ay / la
    const ubx = bx / lb
    const uby = by / lb
    const sx = x + uax * reach
    const sy = y + uay * reach
    const ex = x + ubx * reach
    const ey = y + uby * reach
    const square = Math.abs(uax * ubx + uay * uby) < 1e-6
    const cx = x + (uax + ubx) * reach
    const cy = y + (uay + uby) * reach
    xs.push(sx)
    ys.push(sy)
    pieces.push(xs.length - 1)
    for (let step = 1; step < steps; step++) {
      const t = step / steps
      if (square) {
        const angle = (t * Math.PI) / 2
        const c = Math.cos(angle)
        const s = Math.sin(angle)
        xs.push(cx + (sx - cx) * c + (ex - cx) * s)
        ys.push(cy + (sy - cy) * c + (ey - cy) * s)
      } else {
        const u = 1 - t
        xs.push(u * u * sx + 2 * u * t * x + t * t * ex)
        ys.push(u * u * sy + 2 * u * t * y + t * t * ey)
      }
    }
    xs.push(ex)
    ys.push(ey)
    pieces.push(xs.length - 1)
  }
  xs.push(px[m] ?? 0)
  ys.push(py[m] ?? 0)
  pieces.push(xs.length - 1)
  let best = -1
  let bestLength = -1
  for (let at = 0; at + 1 < pieces.length; at += 2) {
    const a = pieces[at] ?? 0
    const b = pieces[at + 1] ?? 0
    let length = Math.hypot((xs[b] ?? 0) - (xs[a] ?? 0), (ys[b] ?? 0) - (ys[a] ?? 0))
    if (at === 0) length -= start.trim
    if (at + 2 >= pieces.length) length -= end.trim
    if (length > bestLength) {
      bestLength = length
      best = at
    }
  }
  const a = pieces[best] ?? 0
  const b = pieces[best + 1] ?? 0
  let from = 0
  let to = 1
  const total = Math.hypot((xs[b] ?? 0) - (xs[a] ?? 0), (ys[b] ?? 0) - (ys[a] ?? 0))
  if (total > tiny) {
    if (a === 0) from = Math.min(0.5, start.trim / total)
    if (b === xs.length - 1) to = Math.max(0.5, 1 - end.trim / total)
  }
  const middle = (from + to) / 2
  const anchorX = (xs[a] ?? 0) + ((xs[b] ?? 0) - (xs[a] ?? 0)) * middle
  const anchorY = (ys[a] ?? 0) + ((ys[b] ?? 0) - (ys[a] ?? 0)) * middle
  xs.splice(a + 1, 0, anchorX)
  ys.splice(a + 1, 0, anchorY)
  const anchor = a + 1
  const pad = (first: number, last: number, extra: number): void => {
    let longest = first
    let longestLength = -1
    for (let k = first; k < last; k++) {
      const length = Math.hypot((xs[k + 1] ?? 0) - (xs[k] ?? 0), (ys[k + 1] ?? 0) - (ys[k] ?? 0))
      if (length > longestLength) {
        longestLength = length
        longest = k
      }
    }
    const x0 = xs[longest] ?? 0
    const y0 = ys[longest] ?? 0
    const x1 = xs[longest + 1] ?? 0
    const y1 = ys[longest + 1] ?? 0
    const insertX: number[] = []
    const insertY: number[] = []
    for (let step = 1; step <= extra; step++) {
      const t = step / (extra + 1)
      insertX.push(x0 + (x1 - x0) * t)
      insertY.push(y0 + (y1 - y0) * t)
    }
    xs.splice(longest + 1, 0, ...insertX)
    ys.splice(longest + 1, 0, ...insertY)
  }
  const left = anchor
  const right = xs.length - 1 - anchor
  if (left < right) pad(0, anchor, right - left)
  else if (right < left) pad(anchor, xs.length - 1, left - right)
  shape.xs = xs
  shape.ys = ys
  shape.count = xs.length
  shape.room = Math.max(0, bestLength)
}

function uniform(px: readonly number[], py: readonly number[], shape: RouteShape): void {
  const lengths = [0]
  for (let k = 1; k < px.length; k++) {
    lengths.push(
      (lengths[k - 1] ?? 0) +
        Math.hypot((px[k] ?? 0) - (px[k - 1] ?? 0), (py[k] ?? 0) - (py[k - 1] ?? 0)),
    )
  }
  const total = lengths[lengths.length - 1] ?? 0
  const xs: number[] = []
  const ys: number[] = []
  let piece = 1
  for (let k = 0; k < maxStations; k++) {
    const goal = (total * k) / (maxStations - 1)
    while (piece < px.length - 1 && (lengths[piece] ?? 0) < goal) piece++
    const from = lengths[piece - 1] ?? 0
    const width = (lengths[piece] ?? 0) - from
    const t = width > 0 ? Math.min(1, (goal - from) / width) : 0
    xs.push((px[piece - 1] ?? 0) + ((px[piece] ?? 0) - (px[piece - 1] ?? 0)) * t)
    ys.push((py[piece - 1] ?? 0) + ((py[piece] ?? 0) - (py[piece - 1] ?? 0)) * t)
  }
  shape.xs = xs
  shape.ys = ys
  shape.count = maxStations
  shape.room = total
}

export function shapeRoute(
  points: ArrayLike<number>,
  first: number,
  last: number,
  radius: number,
  start: Outline,
  end: Outline,
  shape: RouteShape,
): void {
  const px: number[] = []
  const py: number[] = []
  for (let k = first; k < last; k++) {
    const x = points[k * 2] ?? 0
    const y = points[k * 2 + 1] ?? 0
    const n = px.length
    if (n > 0 && Math.abs((px[n - 1] ?? 0) - x) < tiny && Math.abs((py[n - 1] ?? 0) - y) < tiny) {
      continue
    }
    px.push(x)
    py.push(y)
  }
  if (px.length < 2) {
    shape.xs = [start.x, end.x]
    shape.ys = [start.y, end.y]
    shape.count = 2
    shape.room = 0
    return
  }
  attach(px, py, start, 0, 1)
  attach(px, py, end, px.length - 1, px.length - 2)
  for (let steps = radius > 0 ? arcSteps : 0; steps >= 0; steps--) {
    build(px, py, radius, steps, start, end, shape)
    if (shape.count <= maxStations) return
  }
  uniform(px, py, shape)
}
