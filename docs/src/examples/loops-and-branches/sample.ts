import { random } from '../shared/random'

export interface Spot {
  readonly id: string
  readonly label: string
  readonly base: boolean
  readonly loop: number | null
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface LoopPlan {
  readonly size: number
  readonly from: string
  readonly to: string
  readonly gapAfter?: number
}

const plan: readonly LoopPlan[] = [
  { size: 8, from: 'A', to: 'B' },
  { size: 6, from: 'A', to: 'B' },
  { size: 9, from: 'A', to: 'B' },
  { size: 7, from: 'A', to: 'B' },
  { size: 9, from: 'A', to: 'B', gapAfter: 4 },
  { size: 5, from: 'A', to: 'A' },
]

const branches: readonly (readonly [loop: number, count: number])[] = [
  [0, 2],
  [1, 1],
  [2, 2],
  [3, 1],
  [4, 1],
  [5, 1],
]

export function createLoops(seed: number): { spots: Spot[]; links: Link[] } {
  const next = random(seed)
  const spots: Spot[] = [
    { id: 'A', label: 'A', base: true, loop: null },
    { id: 'B', label: 'B', base: true, loop: null },
  ]
  const links: Link[] = []
  const link = (from: string, to: string) => links.push({ id: `${from}-${to}`, from, to })
  const add = (loop: number | null) => {
    const id = String(spots.length - 1)
    spots.push({ id, label: id, base: false, loop })
    return id
  }

  const loops = plan.map(({ size, from, to, gapAfter }, loop) => {
    const members = Array.from({ length: size }, () => add(loop))
    const chain = [from, ...members, to]
    for (let index = 1; index < chain.length; index++) {
      if (index - 1 !== gapAfter) link(chain[index - 1] as string, chain[index] as string)
    }
    return members
  })

  const member = (loop: number, index: number) => {
    const members = loops[loop] as string[]
    return members.at(index) as string
  }
  const ties = [member(0, -2), member(1, 1), member(2, 1), member(3, -2)]
  link(ties[0] as string, ties[1] as string)
  const middle = add(null)
  link(ties[2] as string, middle)
  link(middle, ties[3] as string)

  const taken = new Set(ties)
  const branch = (at: string) => {
    let parent = at
    const length = 1 + Math.floor(next() * 3)
    for (let step = 0; step < length; step++) {
      const child = add(null)
      link(parent, child)
      if (step === 0 && length > 1 && next() < 0.4) link(child, add(null))
      parent = child
    }
  }
  for (const [loop, count] of branches) {
    const members = loops[loop] as string[]
    for (let made = 0; made < count; ) {
      const at = members[1 + Math.floor(next() * (members.length - 2))] as string
      if (taken.has(at)) continue
      taken.add(at)
      branch(at)
      made++
    }
  }

  return { spots, links }
}
