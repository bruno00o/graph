import { formatNumber, messages } from './messages'

export interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly x: number
  readonly y: number
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly strength: number
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Sample {
  readonly items: Item[]
  readonly links: Link[]
}

export function createSample(nodeCount: number, edgeCount: number, groups = 8, seed = 7): Sample {
  const next = random(seed)
  const gaussian = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next())
  const spread = Math.sqrt(nodeCount) * 9
  const centers = Array.from({ length: groups }, (_, index) => {
    const angle = (index / groups) * Math.PI * 2
    return { x: Math.cos(angle) * spread * 1.6, y: Math.sin(angle) * spread * 1.6 }
  })
  const members: number[][] = centers.map(() => [])
  const groupOf: number[] = []
  const items: Item[] = Array.from({ length: nodeCount }, (_, index) => {
    const group = Math.floor(next() * groups)
    members[group]?.push(index)
    groupOf.push(group)
    const center = centers[group] ?? { x: 0, y: 0 }
    return {
      id: `n${index}`,
      label: messages.node(formatNumber(index + 1)),
      group: messages.group(String.fromCharCode(65 + group)),
      weight: Math.round(1 + next() ** 3 * 99),
      x: center.x + gaussian() * spread * 0.45,
      y: center.y + gaussian() * spread * 0.45,
    }
  })
  const links: Link[] = []
  for (let index = 0; index < edgeCount; index++) {
    const source = Math.floor(next() * nodeCount)
    const pool = next() < 0.92 ? members[groupOf[source] ?? 0] : undefined
    const target =
      pool && pool.length > 0
        ? (pool[Math.floor(next() * pool.length)] ?? 0)
        : Math.floor(next() * nodeCount)
    if (target === source) continue
    links.push({ id: `e${index}`, from: `n${source}`, to: `n${target}`, strength: next() })
  }
  return { items, links }
}
