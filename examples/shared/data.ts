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

export function createSample(
  nodeCount: number,
  edgeCount: number,
  groups = 8,
  seed = 7,
  mixing = 0.08,
): Sample {
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
    const pool = next() >= mixing ? members[groupOf[source] ?? 0] : undefined
    const target =
      pool && pool.length > 0
        ? (pool[Math.floor(next() * pool.length)] ?? 0)
        : Math.floor(next() * nodeCount)
    if (target === source) continue
    links.push({ id: `e${index}`, from: `n${source}`, to: `n${target}`, strength: next() })
  }
  return { items, links }
}

export function createCommunities(nodeCount: number, edgeCount: number, seed = 11): Sample {
  const next = random(seed)
  const sizes: number[] = []
  let total = 0
  while (total < nodeCount) {
    const size = Math.round(12 / (next() || 1e-9) ** 0.75)
    sizes.push(Math.min(nodeCount - total, Math.max(4, size)))
    total += sizes.at(-1) ?? 0
  }
  const degree = new Uint32Array(nodeCount)
  const links: Link[] = []
  const link = (from: number, to: number) => {
    if (from === to) return
    links.push({ id: `e${links.length}`, from: `n${from}`, to: `n${to}`, strength: next() })
    degree[from] = (degree[from] ?? 0) + 1
    degree[to] = (degree[to] ?? 0) + 1
  }
  const inside = (edgeCount * 0.92) / nodeCount
  const starts: number[] = []
  const groupOf = new Uint32Array(nodeCount)
  let first = 0
  sizes.forEach((size, community) => {
    const ends: number[] = []
    for (let offset = 0; offset < size; offset++) {
      const node = first + offset
      groupOf[node] = community
      if (offset === 0) continue
      const count = Math.floor(inside) + (next() < inside % 1 ? 1 : 0)
      for (let k = 0; k < Math.max(1, count); k++) {
        const target =
          ends.length > 0 && next() < 0.8
            ? (ends[Math.floor(next() * ends.length)] ?? first)
            : first + Math.floor(next() * offset)
        link(node, target)
        ends.push(node, target)
      }
    }
    starts.push(first)
    first += size
  })
  const parent = sizes.map((_, community) => Math.floor(next() * community))
  const member = (community: number) =>
    (starts[community] ?? 0) + Math.floor(next() ** 3 * (sizes[community] ?? 1))
  for (let community = 1; community < sizes.length; community++) {
    link(starts[community] ?? 0, member(parent[community] ?? 0))
  }
  while (links.length < edgeCount && sizes.length > 1) {
    const community = 1 + Math.floor(next() * (sizes.length - 1))
    link(member(community), member(parent[community] ?? 0))
  }
  const items: Item[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: messages.node(formatNumber(index + 1)),
    group: messages.group(String.fromCharCode(65 + ((groupOf[index] ?? 0) % 12))),
    weight: Math.min(100, 1 + (degree[index] ?? 0)),
    x: 0,
    y: 0,
  }))
  return { items, links }
}
