import { createSample, type Item, type Link } from '../shared/data'

const world = createSample(2_000, 8_000, 8, 3)
const items = new Map(world.items.map((item) => [item.id, item]))
const incident = new Map<string, Link[]>()
for (const link of world.links) {
  for (const end of [link.from, link.to]) {
    const list = incident.get(end) ?? []
    list.push(link)
    incident.set(end, list)
  }
}

export const firstNode: string = world.items[0]?.id ?? 'n0'

export async function fetchNeighbors(key: string): Promise<{ nodes: Item[]; edges: Link[] }> {
  await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 300))
  const links = incident.get(key) ?? []
  const around = new Set([key, ...links.flatMap((link) => [link.from, link.to])])
  return {
    nodes: [...around].flatMap((id) => items.get(id) ?? []),
    edges: links,
  }
}
