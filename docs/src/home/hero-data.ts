export interface HeroNode {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly x: number
  readonly y: number
}

export interface HeroLink {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly weight: number
}

export interface HeroGraphData {
  readonly nodes: readonly HeroNode[]
  readonly links: readonly HeroLink[]
}

export const heroGroups: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

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

const golden = Math.PI * (3 - Math.sqrt(5))

export function createHeroGraph(seed = 5): HeroGraphData {
  const next = random(seed)
  const nodes: HeroNode[] = []
  const links: HeroLink[] = []
  const hubs: string[] = []
  const members: string[][] = []
  heroGroups.forEach((group, index) => {
    const angle = (index / heroGroups.length) * Math.PI * 2 + 0.4
    const center = { x: Math.cos(angle) * 340, y: Math.sin(angle) * 210 }
    const count = 12 + Math.floor(next() * 10)
    const list: string[] = []
    for (let member = 0; member < count; member++) {
      const id = `n${nodes.length + 1}`
      const hub = member === 0
      const radius = hub ? 0 : 20 + Math.sqrt(member) * 15 + next() * 8
      const turn = member * golden + next() * 0.4
      nodes.push({
        id,
        label: `Node ${nodes.length + 1}`,
        group,
        weight: hub ? 40 + Math.floor(next() * 30) : 1 + Math.floor(next() ** 2 * 24),
        x: center.x + Math.cos(turn) * radius,
        y: center.y + Math.sin(turn) * radius,
      })
      list.push(id)
      if (!hub) {
        const target = next() < 0.55 ? list[0] : list[Math.floor(next() * (list.length - 1))]
        if (target && target !== id) {
          links.push({
            id: `e${links.length + 1}`,
            from: id,
            to: target,
            weight: 1 + Math.round(next() ** 2 * 9),
          })
        }
      }
    }
    const first = list[0]
    if (first) hubs.push(first)
    members.push(list)
  })
  hubs.forEach((hub, index) => {
    const nextHub = hubs[(index + 1) % hubs.length]
    if (nextHub) links.push({ id: `e${links.length + 1}`, from: hub, to: nextHub, weight: 6 })
    const list = members[(index + 3) % members.length] ?? []
    const target = list[1 + Math.floor(next() * (list.length - 1))]
    if (target) links.push({ id: `e${links.length + 1}`, from: hub, to: target, weight: 2 })
  })
  return { nodes, links }
}
