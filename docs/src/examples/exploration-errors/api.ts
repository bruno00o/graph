import { createSample, type Item, type Link } from '../shared/data'

const { items, links } = createSample(400, 1400, 6, 31, 0.1)
const byId = new Map(items.map((item) => [item.id, item]))
const around = new Map<string, Link[]>()
for (const link of links) {
  around.set(link.from, [...(around.get(link.from) ?? []), link])
  around.set(link.to, [...(around.get(link.to) ?? []), link])
}

function failsFirst(key: string): boolean {
  return Number(key.slice(1)) % 3 === 1
}

const first = 'n0'
const near = (around.get(first) ?? []).map((link) => (link.from === first ? link.to : link.from))

export const roots: readonly string[] = [
  first,
  ...near.filter(failsFirst).slice(0, 1),
  ...near.filter((key) => !failsFirst(key)).slice(0, 1),
]

export interface Neighborhood {
  readonly nodes: Item[]
  readonly edges: Link[]
}

export function createServer(): (key: string) => Promise<Neighborhood> {
  const attempts = new Map<string, number>()
  return async (key) => {
    const attempt = (attempts.get(key) ?? 0) + 1
    attempts.set(key, attempt)
    await new Promise((resolve) => setTimeout(resolve, 500 + ((key.length * 131) % 400)))
    if (attempt === 1 && failsFirst(key)) throw new Error(key)
    const edges = around.get(key) ?? []
    const keys = new Set([key, ...edges.flatMap((link) => [link.from, link.to])])
    return { nodes: [...keys].flatMap((id) => byId.get(id) ?? []), edges }
  }
}
