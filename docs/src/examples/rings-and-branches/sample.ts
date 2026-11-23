export interface Spot {
  readonly id: string
  readonly label: string
  readonly base: boolean
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface ChainPlan {
  readonly from: string
  readonly to: string
  readonly size: number
  readonly branches: readonly (readonly [at: number, length: number])[]
  readonly gapAfter?: number
}

const bases = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

const baseLinks = [['C', 'D']] as const

const chains: readonly ChainPlan[] = [
  {
    from: 'A',
    to: 'B',
    size: 5,
    branches: [
      [1, 2],
      [4, 1],
    ],
  },
  { from: 'C', to: 'D', size: 7, branches: [[2, 1]] },
  { from: 'C', to: 'D', size: 6, branches: [], gapAfter: 3 },
  { from: 'E', to: 'F', size: 6, branches: [[2, 2]] },
  { from: 'F', to: 'G', size: 5, branches: [[1, 1]] },
  { from: 'H', to: 'H', size: 5, branches: [] },
]

export function createChains(): { spots: Spot[]; links: Link[] } {
  const spots: Spot[] = bases.map((id) => ({ id, label: id, base: true }))
  const links: Link[] = []
  const link = (from: string, to: string) => {
    links.push({ id: `${from}-${to}`, from, to })
  }
  let count = 0
  const add = () => {
    const id = String(++count)
    spots.push({ id, label: id, base: false })
    return id
  }

  for (const [from, to] of baseLinks) link(from, to)
  for (const { from, to, size, branches, gapAfter } of chains) {
    const members = Array.from({ length: size }, add)
    const path = [from, ...members, to]
    for (let index = 1; index < path.length; index++) {
      if (index - 1 !== gapAfter) link(path[index - 1] as string, path[index] as string)
    }
    for (const [at, length] of branches) {
      let parent = members[at] as string
      for (let step = 0; step < length; step++) {
        const child = add()
        link(parent, child)
        parent = child
      }
    }
  }
  return { spots, links }
}
