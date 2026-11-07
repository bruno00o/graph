export interface Member {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
  readonly group: boolean
}

export interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

export function createGroups(seed = 12): { items: Member[]; links: Tie[] } {
  let state = seed
  const next = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const items: Member[] = []
  const links: Tie[] = []
  const leaves: string[][] = []
  const tie = (from: string, to: string) => links.push({ id: `e${links.length}`, from, to })
  for (const [at, tone] of ['A', 'B', 'C', 'D', 'E', 'F'].entries()) {
    items.push({ id: tone, label: `Group ${tone}`, parent: null, tone, group: true })
    const nested = at < 2 ? ['1', '2'] : ['']
    for (const suffix of nested) {
      const holder = `${tone}${suffix}`
      if (suffix) {
        items.push({ id: holder, label: `Group ${holder}`, parent: tone, tone, group: true })
      }
      const members: string[] = []
      const count = 6 + Math.floor(next() * 6)
      for (let index = 0; index < count; index++) {
        const id = `${holder}-${index}`
        items.push({ id, label: `Node ${items.length + 1}`, parent: holder, tone, group: false })
        if (index > 0) tie(members[Math.floor(next() * index)] ?? id, id)
        members.push(id)
      }
      leaves.push(members)
    }
  }
  for (let at = 0; at < 16; at++) {
    const from = leaves[Math.floor(next() * leaves.length)] ?? []
    const to = leaves[Math.floor(next() * leaves.length)] ?? []
    const source = from[Math.floor(next() * from.length)]
    const target = to[Math.floor(next() * to.length)]
    if (source && target && from !== to) tie(source, target)
  }
  return { items, links }
}
