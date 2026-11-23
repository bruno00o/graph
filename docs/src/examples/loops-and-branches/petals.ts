import type { Point } from '@bruno00o/graph'
import type { Link, Spot } from './sample'

const step = 34
const turn = 2 * Math.PI

export function petals(spots: readonly Spot[], links: readonly Link[]): Map<string, Point> {
  const near = new Map<string, string[]>()
  for (const { from, to } of links) {
    near.set(from, [...(near.get(from) ?? []), to])
    near.set(to, [...(near.get(to) ?? []), from])
  }
  const at = new Map<string, Point>()
  const bases = spots.filter((spot) => spot.base).map((spot) => spot.id)
  bases.forEach((id, index) => {
    const angle = Math.PI + (index * turn) / bases.length
    at.set(id, { x: step * 0.6 * Math.cos(angle), y: step * 0.6 * Math.sin(angle) })
  })

  const loops = new Map<number, string[]>()
  for (const spot of spots) {
    if (spot.loop !== null) loops.set(spot.loop, [...(loops.get(spot.loop) ?? []), spot.id])
  }
  const centers = new Map<string, Point>()
  let petal = 0
  for (const members of loops.values()) {
    const angle = -Math.PI / 2 + (petal++ * turn) / loops.size
    const radius = ((members.length + 1) * step) / turn
    const reach = Math.max(radius + 2 * step, (radius + step / 2) / Math.sin(Math.PI / loops.size))
    const center = { x: reach * Math.cos(angle), y: reach * Math.sin(angle) }
    const slot = (index: number, side: number): Point => {
      const around = angle + Math.PI + (side * (index + 1) * turn) / (members.length + 1)
      return { x: center.x + radius * Math.cos(around), y: center.y + radius * Math.sin(around) }
    }
    const base = at.get(near.get(members[0] as string)?.find((id) => bases.includes(id)) ?? '')
    const side = base && gap(slot(0, -1), base) < gap(slot(0, 1), base) ? -1 : 1
    members.forEach((id, index) => {
      at.set(id, slot(index, side))
      centers.set(id, center)
    })
  }

  const heading = new Map<string, number>()
  const queue = [...at.keys()]
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head] as string
    const from = at.get(id) as Point
    const kids = (near.get(id) ?? []).filter((kid) => !at.has(kid))
    const ahead = heading.get(id) ?? outward(from, centers.get(id))
    const spread = kids.length > 1 ? Math.min(2.4, 0.9 * kids.length) : 0
    kids.forEach((kid, index) => {
      const placed = (near.get(kid) ?? []).filter((other) => other !== id && at.has(other))
      if (placed.length > 0) {
        const all = [from, ...placed.map((other) => at.get(other) as Point)]
        const x = all.reduce((sum, point) => sum + point.x, 0) / all.length
        const y = all.reduce((sum, point) => sum + point.y, 0) / all.length
        at.set(kid, { x, y })
        heading.set(kid, Math.atan2(y, x))
      } else {
        const angle = ahead + spread * ((index + 0.5) / kids.length - 0.5)
        at.set(kid, { x: from.x + step * Math.cos(angle), y: from.y + step * Math.sin(angle) })
        heading.set(kid, angle)
      }
      queue.push(kid)
    })
  }
  return at
}

function outward(point: Point, center: Point | undefined): number {
  if (!center) return Math.atan2(point.y, point.x)
  const ring = gap(point, center) || 1
  const hub = Math.hypot(point.x, point.y) || 1
  return Math.atan2(
    (0.4 * (point.y - center.y)) / ring + point.y / hub,
    (0.4 * (point.x - center.x)) / ring + point.x / hub,
  )
}

function gap(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
