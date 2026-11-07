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
  readonly cost: number
}

export function createMesh(columns: number, rows: number, seed: number) {
  let state = seed | 0 || 1
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const gap = 40
  const spots: Spot[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      spots.push({
        id: `s${spots.length}`,
        label: `Node ${spots.length + 1}`,
        x: (column - (columns - 1) / 2 + (next() - 0.5) * 0.6) * gap,
        y: (row - (rows - 1) / 2 + (next() - 0.5) * 0.6) * gap,
      })
    }
  }
  const links: Link[] = []
  const link = (a: number, b: number, chance: number) => {
    const from = spots[a]
    const to = spots[b]
    if (!from || !to || next() > chance) return
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const cost = Math.round(length * (0.5 + next() ** 2 * 2.5))
    links.push({ id: `l${links.length}`, from: from.id, to: to.id, cost })
  }
  for (let index = 0; index < spots.length; index++) {
    const column = index % columns
    if (column + 1 < columns) link(index, index + 1, 0.85)
    if (index + columns < spots.length) link(index, index + columns, 0.85)
    if (column + 1 < columns && index + columns < spots.length)
      link(index, index + columns + 1, 0.2)
  }
  return { spots, links }
}
