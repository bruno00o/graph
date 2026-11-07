export interface Spot {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly length: number
}

export function createScatter(count: number, nearest: number, seed: number) {
  let state = seed | 0 || 1
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const width = Math.sqrt(count) * 60
  const spots: Spot[] = Array.from({ length: count }, (_, index) => ({
    id: `s${index}`,
    label: `Node ${index + 1}`,
    x: (next() - 0.5) * width * 1.6,
    y: (next() - 0.5) * width,
  }))
  const links: Link[] = []
  const linked = new Set<string>()
  for (const spot of spots) {
    const closest = spots
      .filter((other) => other !== spot)
      .map((other) => ({ other, length: Math.hypot(other.x - spot.x, other.y - spot.y) }))
      .sort((a, b) => a.length - b.length)
      .slice(0, nearest)
    for (const { other, length } of closest) {
      const pair = spot.id < other.id ? `${spot.id} ${other.id}` : `${other.id} ${spot.id}`
      if (linked.has(pair)) continue
      linked.add(pair)
      links.push({
        id: `l${links.length}`,
        from: spot.id,
        to: other.id,
        length: Math.round(length),
      })
    }
  }
  return { spots, links }
}
