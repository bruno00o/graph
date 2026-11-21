export interface SampleNode {
  readonly id: string
  readonly group: string
  readonly degree: number
}

export interface SampleLink {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface Sample {
  readonly nodes: readonly SampleNode[]
  readonly links: readonly SampleLink[]
  readonly hub: string
}

export function seedOf(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0
  }
  return hash
}

function randomOf(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const groupNames = ['a', 'b', 'c', 'd', 'e'] as const

export function sample(seed: number): Sample {
  const random = randomOf(seed)
  const pick = (count: number): number => Math.floor(random() * count)
  const groups = groupNames.slice(0, 3 + pick(3))
  const members: string[][] = groups.map(() => [])
  const ends: [string, string][] = []
  groups.forEach((group, at) => {
    const size = 7 + pick(8)
    for (let index = 0; index < size; index++) {
      const id = `${group}${index}`
      const list = members[at] as string[]
      if (index > 0) ends.push([list[pick(index)] as string, id])
      if (index > 2 && random() < 0.35) ends.push([id, list[pick(index - 1)] as string])
      list.push(id)
    }
  })
  for (let at = 1; at < groups.length; at++) {
    const bridges = 2 + pick(2)
    for (let bridge = 0; bridge < bridges; bridge++) {
      const left = members[pick(at)] as string[]
      const right = members[at] as string[]
      ends.push([left[pick(left.length)] as string, right[pick(right.length)] as string])
    }
  }
  const seen = new Set<string>()
  const links: SampleLink[] = []
  const degrees = new Map<string, number>()
  for (const [from, to] of ends) {
    const key = from < to ? `${from}-${to}` : `${to}-${from}`
    if (from === to || seen.has(key)) continue
    seen.add(key)
    links.push({ id: key, from, to })
    degrees.set(from, (degrees.get(from) ?? 0) + 1)
    degrees.set(to, (degrees.get(to) ?? 0) + 1)
  }
  const nodes = groups.flatMap((group, at) =>
    (members[at] as string[]).map((id) => ({ id, group, degree: degrees.get(id) ?? 0 })),
  )
  let hub = nodes[0]?.id ?? ''
  let most = -1
  for (const node of nodes) {
    if (node.degree > most) {
      most = node.degree
      hub = node.id
    }
  }
  return { nodes, links, hub }
}
