import { random } from '../shared/random'

export interface Place {
  readonly id: string
  readonly label: string
  readonly group: string
}

export interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

export function createNetwork(
  count = 60,
  shortcuts = 8,
  seed = 6,
): { items: Place[]; links: Tie[] } {
  const next = random(seed)
  const items: Place[] = Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index + 1}`,
    group: String.fromCharCode(65 + Math.floor(index / 12)),
  }))
  const links: Tie[] = []
  const seen = new Set<string>()
  const add = (from: number, to: number) => {
    const key = from < to ? `${from}-${to}` : `${to}-${from}`
    if (from === to || seen.has(key)) return
    seen.add(key)
    links.push({ id: `e${links.length}`, from: `n${from}`, to: `n${to}` })
  }
  for (let index = 1; index < count; index++) add(Math.floor((next() * index) / 2.5), index)
  for (let made = 0; made < shortcuts; made++) {
    add(Math.floor(next() * count), Math.floor(next() * count))
  }
  return { items, links }
}
