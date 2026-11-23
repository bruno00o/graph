import type { Point } from '@bruno00o/graph'
import type { Link, Spot } from './sample'

export interface Ring {
  readonly nodes: readonly string[]
  readonly from: string
  readonly to: string
}

export function findRings(
  spots: readonly Spot[],
  links: readonly Link[],
  secured: ReadonlySet<string>,
): Ring[] {
  const near = neighbors(links)
  const bases = new Set(spots.filter((spot) => spot.base).map((spot) => spot.id))
  const seen = new Set<string>()
  const rings: Ring[] = []
  for (const spot of spots) {
    if (spot.base || seen.has(spot.id)) continue
    const side = secured.has(spot.id)
    const part = new Set([spot.id])
    for (const id of part) {
      for (const next of near.get(id) ?? []) {
        if (!bases.has(next) && secured.has(next) === side) part.add(next)
      }
    }
    for (const id of part) seen.add(id)
    const holds = (id: string) => (side ? bases.has(id) : !part.has(id))
    const ring = spineOf(part, near, holds)
    if (ring) rings.push(ring)
  }
  return rings
}

function spineOf(
  part: ReadonlySet<string>,
  near: ReadonlyMap<string, readonly string[]>,
  holds: (id: string) => boolean,
): Ring | null {
  const spine = new Set(part)
  const degree = (id: string) =>
    (near.get(id) ?? []).filter((next) => spine.has(next) || holds(next)).length
  for (let pruned = true; pruned; ) {
    pruned = false
    for (const id of spine) {
      if (degree(id) > 1) continue
      spine.delete(id)
      pruned = true
    }
  }
  if (spine.size === 0 || [...spine].some((id) => degree(id) !== 2)) return null
  const ends = [...spine].filter((id) => (near.get(id) ?? []).some(holds))
  const first = ends[0]
  if (first === undefined || ends.length > 2) return null
  const nodes = [first]
  for (let at = first, before = ''; ; ) {
    const next = (near.get(at) ?? []).find((id) => spine.has(id) && id !== before)
    if (next === undefined || nodes.includes(next)) break
    nodes.push(next)
    before = at
    at = next
  }
  if (nodes.length !== spine.size) return null
  const anchor = (id: string, other?: string) =>
    (near.get(id) ?? []).filter(holds).find((hold) => hold !== other) ??
    (near.get(id) ?? []).find(holds)
  const from = anchor(first)
  const to = anchor(nodes[nodes.length - 1] as string, nodes.length === 1 ? from : undefined)
  return from && to ? { nodes, from, to } : null
}

const step = 40

export function ringLayout(
  spots: readonly Spot[],
  links: readonly Link[],
  rings: readonly Ring[],
): Map<string, Point> {
  const near = neighbors(links)
  const bases = spots.filter((spot) => spot.base).map((spot) => spot.id)
  const root = new Map(bases.map((base) => [base, base]))
  const find = (base: string): string => {
    const up = root.get(base) ?? base
    return up === base ? base : find(up)
  }
  for (const ring of rings) root.set(find(ring.from), find(ring.to))
  const units = new Map<string, string[]>()
  for (const base of bases) units.set(find(base), [...(units.get(find(base)) ?? []), base])

  const taken = new Set([...bases, ...rings.flatMap((ring) => ring.nodes)])
  const boxes: {
    local: Map<string, Point>
    left: number
    right: number
    top: number
    bottom: number
  }[] = []
  for (const members of units.values()) {
    const local = new Map<string, Point>()
    const centers = new Map<string, Point>()
    const own = rings.filter((ring) => members.includes(ring.from))
    placeBases(members, own, local)
    for (const ring of own) {
      const a = local.get(ring.from) as Point
      const b = local.get(ring.to) as Point
      const twins = own.filter(
        (other) =>
          (other.from === ring.from && other.to === ring.to) ||
          (other.from === ring.to && other.to === ring.from),
      )
      const below = twins.indexOf(ring) % 2 === 0
      const toward = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + (below ? 1 : -1) * step }
      const placed =
        ring.from === ring.to
          ? circle(a, ring.nodes.length, toward)
          : arc(a, b, ring.nodes.length, toward)
      ring.nodes.forEach((id, place) => {
        local.set(id, placed.points[place] as Point)
        centers.set(id, placed.center)
      })
      for (const base of [ring.from, ring.to]) centers.set(base, placed.center)
    }
    fan(local, centers, near, taken)
    const xs = [...local.values()].map((point) => point.x)
    const ys = [...local.values()].map((point) => point.y)
    boxes.push({
      local,
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    })
  }

  const margin = 2 * step
  const area = boxes.reduce(
    (sum, box) => sum + (box.right - box.left + margin) * (box.bottom - box.top + margin),
    0,
  )
  const width = 1.5 * Math.sqrt(area)
  const at = new Map<string, Point>()
  let y = 0
  for (let first = 0; first < boxes.length; ) {
    const row = [boxes[first] as (typeof boxes)[number]]
    let used = row[0] ? row[0].right - row[0].left : 0
    while (first + row.length < boxes.length) {
      const next = boxes[first + row.length] as (typeof boxes)[number]
      if (used + margin + next.right - next.left > width) break
      used += margin + next.right - next.left
      row.push(next)
    }
    const above = Math.max(...row.map((box) => -box.top))
    let x = 0
    for (const box of row) {
      for (const [id, point] of box.local) {
        at.set(id, { x: x + point.x - box.left, y: y + above + point.y })
      }
      x += box.right - box.left + margin
    }
    y += above + Math.max(...row.map((box) => box.bottom)) + margin
    first += row.length
  }
  return at
}

function placeBases(members: readonly string[], own: readonly Ring[], local: Map<string, Point>) {
  const pair = members.length === 2 && own.every((ring) => ring.from !== ring.to)
  if (members.length === 1 || pair) {
    members.forEach((base, index) => {
      local.set(base, { x: (index - (members.length - 1) / 2) * 1.6 * step, y: 0 })
    })
    return
  }
  const order = [
    members.find(
      (base) => own.filter((ring) => ring.from === base || ring.to === base).length === 1,
    ) ?? (members[0] as string),
  ]
  while (order.length < members.length) {
    const last = order[order.length - 1] as string
    const next =
      own
        .map((ring) => (ring.from === last ? ring.to : ring.to === last ? ring.from : ''))
        .find((base) => base && !order.includes(base)) ??
      members.find((base) => !order.includes(base))
    order.push(next as string)
  }
  let x = 0
  order.forEach((base, index) => {
    if (index > 0) {
      const before = order[index - 1] as string
      const spans = own.filter(
        (ring) =>
          (ring.from === before && ring.to === base) || (ring.from === base && ring.to === before),
      )
      x += Math.max(
        2 * step,
        ...spans.map((ring) => (2 * (ring.nodes.length + 1) * step) / Math.PI),
      )
    }
    local.set(base, { x, y: 0 })
  })
}

function fan(
  local: Map<string, Point>,
  centers: ReadonlyMap<string, Point>,
  near: ReadonlyMap<string, readonly string[]>,
  taken: Set<string>,
) {
  const heading = new Map<string, number>()
  const queue = [...local.keys()]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as string
    const from = local.get(id) as Point
    const kids = (near.get(id) ?? []).filter((kid) => !taken.has(kid))
    const center = centers.get(id)
    const ahead =
      heading.get(id) ?? (center ? Math.atan2(from.y - center.y, from.x - center.x) : Math.PI / 2)
    const spread = kids.length > 1 ? Math.min(2.4, 0.9 * kids.length) : 0
    kids.forEach((kid, index) => {
      const angle = ahead + spread * ((index + 0.5) / kids.length - 0.5)
      local.set(kid, { x: from.x + step * Math.cos(angle), y: from.y + step * Math.sin(angle) })
      heading.set(kid, angle)
      taken.add(kid)
      queue.push(kid)
    })
  }
}

interface Placed {
  readonly center: Point
  readonly points: readonly Point[]
}

function arc(a: Point, b: Point, count: number, toward: Point): Placed {
  const chord = gap(a, b)
  const length = (count + 1) * step
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  if (chord === 0) return circle(a, count, toward)
  let nx = (a.y - b.y) / chord
  let ny = (b.x - a.x) / chord
  if ((toward.x - middle.x) * nx + (toward.y - middle.y) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  let low = 1e-6
  let high = 2 * Math.PI - 1e-6
  const ratio = Math.max(length / chord, 1 + 1e-9)
  for (let round = 0; round < 60; round++) {
    const angle = (low + high) / 2
    if (angle / (2 * Math.sin(angle / 2)) < ratio) low = angle
    else high = angle
  }
  const angle = (low + high) / 2
  const radius = chord / (2 * Math.sin(angle / 2))
  const center = {
    x: middle.x - nx * radius * Math.cos(angle / 2),
    y: middle.y - ny * radius * Math.cos(angle / 2),
  }
  const first = Math.atan2(a.y - center.y, a.x - center.x)
  const bulge = Math.atan2(ny, nx)
  const sign =
    Math.abs(wrap(first + angle / 2 - bulge)) < Math.abs(wrap(first - angle / 2 - bulge)) ? 1 : -1
  const points = Array.from({ length: count }, (_, index) => {
    const turn = first + (sign * (index + 1) * angle) / (count + 1)
    return { x: center.x + radius * Math.cos(turn), y: center.y + radius * Math.sin(turn) }
  })
  return { center, points }
}

function circle(hold: Point, count: number, toward: Point): Placed {
  const radius = ((count + 1) * step) / (2 * Math.PI)
  const away = gap(toward, hold) || 1
  const center = {
    x: hold.x + (radius * (toward.x - hold.x)) / away,
    y: hold.y + (radius * (toward.y - hold.y)) / away,
  }
  const first = Math.atan2(hold.y - center.y, hold.x - center.x)
  const points = Array.from({ length: count }, (_, index) => {
    const turn = first + ((index + 1) * 2 * Math.PI) / (count + 1)
    return { x: center.x + radius * Math.cos(turn), y: center.y + radius * Math.sin(turn) }
  })
  return { center, points }
}

function neighbors(links: readonly Link[]): Map<string, string[]> {
  const near = new Map<string, string[]>()
  for (const { from, to } of links) {
    near.set(from, [...(near.get(from) ?? []), to])
    near.set(to, [...(near.get(to) ?? []), from])
  }
  return near
}

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function gap(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
