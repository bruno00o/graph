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

export function createGrid(columns: number, rows: number, seed: number) {
  let state = seed | 0 || 1
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const gap = 64
  const spots: Spot[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      spots.push({
        id: `s${spots.length}`,
        label: String.fromCharCode(65 + row) + String(column + 1),
        x: (column - (columns - 1) / 2 + (next() - 0.5) * 0.4) * gap,
        y: (row - (rows - 1) / 2 + (next() - 0.5) * 0.4) * gap,
      })
    }
  }
  const links: Link[] = []
  const link = (a: number, b: number, chance: number) => {
    const from = spots[a]
    const to = spots[b]
    if (!from || !to || next() > chance) return
    links.push({
      id: `l${links.length}`,
      from: from.id,
      to: to.id,
      cost: 1 + Math.floor(next() * 9),
    })
  }
  for (let index = 0; index < spots.length; index++) {
    const column = index % columns
    if (column + 1 < columns) link(index, index + 1, 0.9)
    if (index + columns < spots.length) link(index, index + columns, 0.9)
  }
  return { spots, links }
}
