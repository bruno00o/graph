export interface Triangulation {
  readonly indices: Uint32Array
  readonly count: number
  readonly forced: number
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

export function ringArea(points: ArrayLike<number>, from: number, to: number): number {
  const ox = points[from * 2] ?? 0
  const oy = points[from * 2 + 1] ?? 0
  let sum = 0
  for (let i = from; i < to; i++) {
    const j = i + 1 < to ? i + 1 : from
    sum += ((points[i * 2] ?? 0) - ox) * ((points[j * 2 + 1] ?? 0) - oy)
    sum -= ((points[j * 2] ?? 0) - ox) * ((points[i * 2 + 1] ?? 0) - oy)
  }
  return sum / 2
}

export function triangleArea(
  points: Float64Array,
  indices: Uint32Array,
  count: number,
  ox: number,
  oy: number,
): number {
  let sum = 0
  for (let k = 0; k + 2 < count; k += 3) {
    const a = (indices[k] ?? 0) * 2
    const b = (indices[k + 1] ?? 0) * 2
    const c = (indices[k + 2] ?? 0) * 2
    sum += Math.abs(
      cross(
        (points[a] ?? 0) - ox,
        (points[a + 1] ?? 0) - oy,
        (points[b] ?? 0) - ox,
        (points[b + 1] ?? 0) - oy,
        (points[c] ?? 0) - ox,
        (points[c + 1] ?? 0) - oy,
      ),
    )
  }
  return sum / 2
}

const noTriangles: Triangulation = { indices: new Uint32Array(0), count: 0, forced: 0 }
const gridFrom = 64

let px = new Float64Array(64)
let py = new Float64Array(64)
let source = new Uint32Array(64)
let prev = new Int32Array(64)
let next = new Int32Array(64)
let reflex = new Uint8Array(64)
let removed = new Uint8Array(64)
let chain = new Int32Array(64)
let listed = new Int32Array(64)
let listedX = new Float64Array(64)
let head = new Int32Array(64)

function reserve(size: number): void {
  if (size <= px.length) return
  const length = Math.max(size, px.length * 2)
  px = new Float64Array(length)
  py = new Float64Array(length)
  source = new Uint32Array(length)
  prev = new Int32Array(length)
  next = new Int32Array(length)
  reflex = new Uint8Array(length)
  removed = new Uint8Array(length)
  chain = new Int32Array(length)
  listed = new Int32Array(length)
  listedX = new Float64Array(length)
}

export function triangulate(
  points: Float64Array,
  first: number,
  ends: readonly number[],
): Triangulation {
  const last = ends[ends.length - 1] ?? first
  const holes = ends.length - 1
  const size = last - first + holes * 2
  if (size < 3) return noTriangles
  reserve(size)
  const xs = px
  const ys = py
  const from = source
  const before = prev
  const after = next
  const bent = reflex
  const gone = removed
  bent.fill(0, 0, size)
  gone.fill(0, 0, size)
  let used = 0

  function makeRing(start: number, end: number, positive: boolean): number {
    const ring = used
    let count = 0
    const reverse = ringArea(points, start, end) > 0 !== positive
    for (let k = 0; k < end - start; k++) {
      const i = reverse ? end - 1 - k : start + k
      const vx = points[i * 2] ?? 0
      const vy = points[i * 2 + 1] ?? 0
      if (count > 0 && xs[used - 1] === vx && ys[used - 1] === vy) continue
      xs[used] = vx
      ys[used] = vy
      from[used] = i
      used++
      count++
    }
    while (count > 1 && xs[used - 1] === xs[ring] && ys[used - 1] === ys[ring]) {
      used--
      count--
    }
    if (count < 3) {
      used = ring
      return -1
    }
    for (let k = 0; k < count; k++) {
      const node = ring + k
      before[node] = k === 0 ? ring + count - 1 : node - 1
      after[node] = k === count - 1 ? ring : node + 1
    }
    return ring
  }

  function isReflex(node: number): boolean {
    const a = before[node] ?? 0
    const c = after[node] ?? 0
    return cross(xs[a] ?? 0, ys[a] ?? 0, xs[node] ?? 0, ys[node] ?? 0, xs[c] ?? 0, ys[c] ?? 0) <= 0
  }

  const outer = makeRing(first, ends[0] ?? first, true)
  if (outer < 0) return noTriangles
  const holeStarts: number[] = []
  for (let h = 1; h <= holes; h++) {
    const start = makeRing(ends[h - 1] ?? 0, ends[h] ?? 0, false)
    if (start >= 0) holeStarts.push(start)
  }

  if (holeStarts.length > 0) {
    const rightmost = holeStarts.map((start) => {
      let best = start
      for (let node = after[start] ?? 0; node !== start; node = after[node] ?? 0) {
        const nx = xs[node] ?? 0
        const bx = xs[best] ?? 0
        if (nx > bx || (nx === bx && (ys[node] ?? 0) < (ys[best] ?? 0))) best = node
      }
      return best
    })
    const order = rightmost
      .map((_, i) => i)
      .sort((a, b) => (xs[rightmost[b] ?? 0] ?? 0) - (xs[rightmost[a] ?? 0] ?? 0))
    for (const h of order) bridge(rightmost[h] ?? 0)
  }

  function bridge(m: number): void {
    const mx = xs[m] ?? 0
    const my = ys[m] ?? 0
    let hit = Number.POSITIVE_INFINITY
    let edge = -1
    let node = outer
    do {
      const a = node
      const b = after[node] ?? 0
      const ay = ys[a] ?? 0
      const by = ys[b] ?? 0
      if ((ay <= my && by >= my) || (ay >= my && by <= my)) {
        const ax = xs[a] ?? 0
        const bx = xs[b] ?? 0
        const at = ay === by ? Math.max(ax, bx) : ax + ((my - ay) * (bx - ax)) / (by - ay)
        if (at >= mx && at < hit) {
          hit = at
          edge = a
        }
      }
      node = b
    } while (node !== outer)
    if (edge < 0) return
    const ea = edge
    const eb = after[edge] ?? 0
    const tolerance = 1e-9 * (Math.abs(mx) + Math.abs(my) + 1)
    let p = (xs[ea] ?? 0) > (xs[eb] ?? 0) ? ea : eb
    let onVertex = true
    if (Math.abs((ys[ea] ?? 0) - my) <= tolerance && Math.abs((xs[ea] ?? 0) - hit) <= tolerance) {
      p = ea
    } else if (
      Math.abs((ys[eb] ?? 0) - my) <= tolerance &&
      Math.abs((xs[eb] ?? 0) - hit) <= tolerance
    ) {
      p = eb
    } else {
      onVertex = false
    }
    if (!onVertex) {
      const tx = xs[p] ?? 0
      const ty = ys[p] ?? 0
      let bestCos = -2
      let bestDistance = Number.POSITIVE_INFINITY
      let scan = outer
      do {
        if (scan !== p && isReflex(scan)) {
          const sx = xs[scan] ?? 0
          const sy = ys[scan] ?? 0
          const s1 = cross(mx, my, hit, my, sx, sy)
          const s2 = cross(hit, my, tx, ty, sx, sy)
          const s3 = cross(tx, ty, mx, my, sx, sy)
          const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
          if (inside && sx >= mx) {
            const distance = Math.hypot(sx - mx, sy - my)
            const cos = distance > 0 ? (sx - mx) / distance : 1
            if (cos > bestCos || (cos === bestCos && distance < bestDistance)) {
              bestCos = cos
              bestDistance = distance
              p = scan
            }
          }
        }
        scan = after[scan] ?? 0
      } while (scan !== outer)
    }
    const vx = xs[p] ?? 0
    const vy = ys[p] ?? 0
    let scan = outer
    do {
      if (xs[scan] === vx && ys[scan] === vy) {
        const a = before[scan] ?? 0
        const c = after[scan] ?? 0
        const ax = xs[a] ?? 0
        const ay = ys[a] ?? 0
        const cx = xs[c] ?? 0
        const cy = ys[c] ?? 0
        const left = cross(ax, ay, vx, vy, mx, my) > 0
        const right = cross(vx, vy, cx, cy, mx, my) > 0
        const convex = cross(ax, ay, vx, vy, cx, cy) > 0
        if (convex ? left && right : left || right) {
          p = scan
          break
        }
      }
      scan = after[scan] ?? 0
    } while (scan !== outer)
    if (vx === mx && vy === my) {
      const pNext = after[p] ?? 0
      const mNext = after[m] ?? 0
      after[p] = mNext
      before[mNext] = p
      after[m] = pNext
      before[pNext] = m
      return
    }
    const p2 = used++
    const m2 = used++
    xs[p2] = vx
    ys[p2] = vy
    from[p2] = from[p] ?? 0
    xs[m2] = mx
    ys[m2] = my
    from[m2] = from[m] ?? 0
    const pNext = after[p] ?? 0
    const mPrev = before[m] ?? 0
    after[p] = m
    before[m] = p
    after[mPrev] = m2
    before[m2] = mPrev
    after[m2] = p2
    before[p2] = m2
    after[p2] = pNext
    before[pNext] = p2
  }

  let remaining = 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let reflexCount = 0
  let walk = outer
  do {
    remaining++
    const wx = xs[walk] ?? 0
    const wy = ys[walk] ?? 0
    if (wx < minX) minX = wx
    if (wx > maxX) maxX = wx
    if (wy < minY) minY = wy
    if (wy > maxY) maxY = wy
    walk = after[walk] ?? 0
  } while (walk !== outer)

  const gridded = remaining > gridFrom
  const side = gridded ? Math.ceil(Math.sqrt(remaining / 4)) : 1
  const cellWidth = (maxX - minX) / side || 1
  const cellHeight = (maxY - minY) / side || 1
  if (gridded) {
    if (head.length < side * side) head = new Int32Array(side * side)
    head.fill(-1, 0, side * side)
  }
  const cells = head
  const links = chain
  const list = listed
  const keys = listedX
  const column = (value: number) => {
    const at = Math.floor((value - minX) / cellWidth)
    return at < 0 ? 0 : at >= side ? side - 1 : at
  }
  const row = (value: number) => {
    const at = Math.floor((value - minY) / cellHeight)
    return at < 0 ? 0 : at >= side ? side - 1 : at
  }
  walk = outer
  do {
    if (isReflex(walk)) {
      bent[walk] = 1
      if (gridded) {
        const cell = row(ys[walk] ?? 0) * side + column(xs[walk] ?? 0)
        links[walk] = cells[cell] ?? -1
        cells[cell] = walk
      } else {
        const x = xs[walk] ?? 0
        let k = reflexCount
        while (k > 0 && (keys[k - 1] ?? 0) > x) {
          keys[k] = keys[k - 1] ?? 0
          list[k] = list[k - 1] ?? 0
          k--
        }
        keys[k] = x
        list[k] = walk
      }
      reflexCount++
    }
    walk = after[walk] ?? 0
  } while (walk !== outer)
  const listedCount = reflexCount

  function blocks(
    p: number,
    a: number,
    v: number,
    c: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    strict: boolean,
  ): boolean {
    if (gone[p] === 1 || bent[p] === 0 || p === a || p === v || p === c) return false
    const qx = xs[p] ?? 0
    const qy = ys[p] ?? 0
    if ((qx === ax && qy === ay) || (qx === bx && qy === by) || (qx === cx && qy === cy)) {
      return false
    }
    const first = cross(ax, ay, bx, by, qx, qy)
    const second = cross(bx, by, cx, cy, qx, qy)
    const third = cross(cx, cy, ax, ay, qx, qy)
    return strict ? first > 0 && second > 0 && third > 0 : first >= 0 && second >= 0 && third >= 0
  }

  function isEar(v: number, strict: boolean): boolean {
    const a = before[v] ?? 0
    const c = after[v] ?? 0
    const ax = xs[a] ?? 0
    const ay = ys[a] ?? 0
    const bx = xs[v] ?? 0
    const by = ys[v] ?? 0
    const cx = xs[c] ?? 0
    const cy = ys[c] ?? 0
    if (cross(ax, ay, bx, by, cx, cy) <= 0) return false
    if (reflexCount === 0) return true
    const x0 = Math.min(ax, bx, cx)
    const x1 = Math.max(ax, bx, cx)
    const y0 = Math.min(ay, by, cy)
    const y1 = Math.max(ay, by, cy)
    if (!gridded) {
      let low = 0
      let high = listedCount
      while (low < high) {
        const middle = (low + high) >> 1
        if ((keys[middle] ?? 0) < x0) low = middle + 1
        else high = middle
      }
      for (let k = low; k < listedCount; k++) {
        if ((keys[k] ?? 0) > x1) break
        const p = list[k] ?? 0
        const qy = ys[p] ?? 0
        if (qy < y0 || qy > y1) continue
        if (blocks(p, a, v, c, ax, ay, bx, by, cx, cy, strict)) return false
      }
      return true
    }
    const c1 = column(x1)
    const r1 = row(y1)
    const c0 = column(x0)
    for (let r = row(y0); r <= r1; r++) {
      for (let col = c0; col <= c1; col++) {
        for (let p = cells[r * side + col] ?? -1; p >= 0; p = links[p] ?? -1) {
          const qx = xs[p] ?? 0
          const qy = ys[p] ?? 0
          if (qx < x0 || qx > x1 || qy < y0 || qy > y1) continue
          if (blocks(p, a, v, c, ax, ay, bx, by, cx, cy, strict)) return false
        }
      }
    }
    return true
  }

  const indices = new Uint32Array(Math.max(0, (remaining - 2) * 3))
  let count = 0
  let forced = 0
  function settle(node: number): void {
    if (bent[node] === 1 && !isReflex(node)) {
      bent[node] = 0
      reflexCount--
    }
  }
  function clip(node: number): void {
    const a = before[node] ?? 0
    const c = after[node] ?? 0
    if (count + 3 <= indices.length) {
      indices[count++] = from[a] ?? 0
      indices[count++] = from[node] ?? 0
      indices[count++] = from[c] ?? 0
    }
    after[a] = c
    before[c] = a
    gone[node] = 1
    if (bent[node] === 1) {
      bent[node] = 0
      reflexCount--
    }
    remaining--
    settle(a)
    settle(c)
  }
  let v = outer
  let stall = 0
  while (remaining > 2) {
    if (isEar(v, false)) {
      const following = after[v] ?? 0
      clip(v)
      v = following
      stall = 0
      continue
    }
    v = after[v] ?? 0
    stall++
    if (stall > remaining) {
      let pick = -1
      let scanned = v
      do {
        if (isEar(scanned, true)) pick = scanned
        scanned = after[scanned] ?? 0
      } while (pick < 0 && scanned !== v)
      if (pick < 0) {
        pick = v
        for (scanned = after[v] ?? 0; scanned !== v; scanned = after[scanned] ?? 0) {
          if (!isReflex(scanned)) {
            pick = scanned
            break
          }
        }
        forced++
      }
      const following = after[pick] ?? 0
      clip(pick)
      v = following
      stall = 0
    }
  }
  return { indices, count, forced }
}
