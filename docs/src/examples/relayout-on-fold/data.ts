export interface Member {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
}

export interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

export const groupKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function createGroups(seed = 5): { items: Member[]; links: Tie[] } {
  let state = seed
  const next = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const items: Member[] = []
  const links: Tie[] = []
  const members: string[][] = []
  const tie = (from: string, to: string) => links.push({ id: `e${links.length}`, from, to })
  for (const tone of groupKeys) {
    items.push({ id: tone, label: `Group ${tone}`, parent: null, tone })
    const inside: string[] = []
    const count = 4 + Math.floor(next() * 12)
    for (let index = 0; index < count; index++) {
      const id = `${tone}-${index}`
      items.push({ id, label: `Node ${items.length + 1}`, parent: tone, tone })
      if (index > 0) tie(inside[Math.floor(next() * index)] ?? id, id)
      inside.push(id)
    }
    members.push(inside)
  }
  for (let at = 0; at < groupKeys.length; at++) {
    for (const step of [1, 2]) {
      const from = members[at] ?? []
      const to = members[(at + step) % groupKeys.length] ?? []
      tie(from[Math.floor(next() * from.length)] ?? '', to[Math.floor(next() * to.length)] ?? '')
    }
  }
  return { items, links }
}
