import { random } from '../shared/random'

export interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

export const groups: readonly string[] = ['A', 'B', 'C', 'D', 'E']

const next = random(41)
const itemCount = 60

export const items: Item[] = Array.from({ length: itemCount }, (_, index) => ({
  id: `n${index}`,
  label: `Item ${index + 1}`,
  group: groups[index % groups.length] ?? 'A',
  weight: 1 + Math.floor(next() ** 2 * 9),
}))

const members = groups.map((group) => items.filter((item) => item.group === group))
const seen = new Set<string>()

export const links: Link[] = []

function connect(from: Item | undefined, to: Item | undefined): void {
  if (!from || !to || from === to) return
  const key = from.id < to.id ? `${from.id}-${to.id}` : `${to.id}-${from.id}`
  if (seen.has(key)) return
  seen.add(key)
  links.push({ id: `e${links.length}`, from: from.id, to: to.id })
}

function pick<T>(list: readonly T[]): T | undefined {
  return list[Math.floor(next() * list.length)]
}

for (const local of members) {
  local.forEach((item, rank) => {
    if (rank > 0) connect(item, pick(local.slice(0, rank)))
    if (next() < 0.4) connect(item, pick(local))
  })
}

for (let count = 0; count < 10; count++) connect(pick(items), pick(items))

export const degrees = new Map<string, number>()
export const adjacency = new Map<string, string[]>()

for (const link of links) {
  degrees.set(link.from, (degrees.get(link.from) ?? 0) + 1)
  degrees.set(link.to, (degrees.get(link.to) ?? 0) + 1)
  adjacency.set(link.from, [...(adjacency.get(link.from) ?? []), link.to])
  adjacency.set(link.to, [...(adjacency.get(link.to) ?? []), link.from])
}

export const hub: Item = items.reduce((best, item) =>
  (degrees.get(item.id) ?? 0) > (degrees.get(best.id) ?? 0) ? item : best,
)
