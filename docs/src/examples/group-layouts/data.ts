import { random } from '../shared/random'

export type Arrangement = 'layers' | 'radial' | 'rings' | 'grid' | 'force'

export interface Member {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
  readonly group: boolean
  readonly arrangement: Arrangement | null
}

export interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface Plan {
  readonly id: string
  readonly arrangement: Arrangement
  readonly count: number
  readonly shape: 'chain' | 'star' | 'cycle' | 'none' | 'dense'
  readonly parent?: string
}

const plans: readonly Plan[] = [
  { id: 'A', arrangement: 'layers', count: 14, shape: 'chain' },
  { id: 'B', arrangement: 'radial', count: 16, shape: 'star' },
  { id: 'C', arrangement: 'rings', count: 12, shape: 'cycle' },
  { id: 'D', arrangement: 'grid', count: 0, shape: 'none' },
  { id: 'D1', arrangement: 'force', count: 9, shape: 'dense', parent: 'D' },
  { id: 'D2', arrangement: 'force', count: 8, shape: 'dense', parent: 'D' },
  { id: 'D3', arrangement: 'force', count: 7, shape: 'dense', parent: 'D' },
  { id: 'E', arrangement: 'grid', count: 15, shape: 'none' },
]

export function createGroups(seed = 7): { items: Member[]; links: Tie[] } {
  const next = random(seed)
  const items: Member[] = []
  const links: Tie[] = []
  const members = new Map<string, string[]>()
  const tie = (from: string, to: string) => links.push({ id: `t${links.length}`, from, to })
  for (const plan of plans) {
    const tone = plan.parent ?? plan.id
    items.push({
      id: plan.id,
      label: `Group ${plan.id}`,
      parent: plan.parent ?? null,
      tone,
      group: true,
      arrangement: plan.arrangement,
    })
    const ids: string[] = []
    for (let index = 0; index < plan.count; index++) {
      const id = `${plan.id}-${index + 1}`
      items.push({
        id,
        label: `Node ${id}`,
        parent: plan.id,
        tone,
        group: false,
        arrangement: null,
      })
      if (index > 0) {
        if (plan.shape === 'chain') {
          tie(ids[Math.max(0, index - 1 - Math.floor(next() * 2))] ?? id, id)
        } else if (plan.shape === 'star') {
          tie(ids[Math.floor(next() * Math.min(index, 4))] ?? id, id)
        } else if (plan.shape === 'cycle') {
          tie(ids[index - 1] ?? id, id)
        } else if (plan.shape === 'dense') {
          tie(ids[Math.floor(next() * index)] ?? id, id)
          if (index > 2) tie(ids[Math.floor(next() * index)] ?? id, id)
        }
      }
      ids.push(id)
    }
    if (plan.shape === 'cycle' && ids.length > 2) tie(ids[ids.length - 1] ?? '', ids[0] ?? '')
    members.set(plan.id, ids)
  }
  const pools = [...members.values()].filter((ids) => ids.length > 0)
  for (let at = 0; at < 14; at++) {
    const from = pools[Math.floor(next() * pools.length)] ?? []
    const to = pools[Math.floor(next() * pools.length)] ?? []
    const source = from[Math.floor(next() * from.length)]
    const target = to[Math.floor(next() * to.length)]
    if (source && target && from !== to) tie(source, target)
  }
  return { items, links }
}
