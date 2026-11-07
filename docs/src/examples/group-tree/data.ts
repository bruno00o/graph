export interface Part {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
  readonly depth: number
}

export interface Joint {
  readonly id: string
  readonly from: string
  readonly to: string
}

export function createNesting(seed = 9): { items: Part[]; links: Joint[]; groups: Part[] } {
  let state = seed
  const next = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const items: Part[] = []
  const groups: Part[] = []
  const links: Joint[] = []
  const leaves: string[][] = []
  const group = (id: string, parent: string | null, tone: string, depth: number) => {
    const part = { id, label: `Group ${id}`, parent, tone, depth }
    items.push(part)
    groups.push(part)
  }
  for (const tone of ['A', 'B', 'C']) {
    group(tone, null, tone, 1)
    for (const middle of ['1', '2']) {
      group(`${tone}${middle}`, tone, tone, 2)
      for (const inner of ['a', 'b']) {
        const id = `${tone}${middle}${inner}`
        group(id, `${tone}${middle}`, tone, 3)
        const members: string[] = []
        const count = 3 + Math.floor(next() * 4)
        for (let index = 0; index < count; index++) {
          const member = `${id}-${index}`
          items.push({ id: member, label: `Node ${items.length + 1}`, parent: id, tone, depth: 4 })
          if (index > 0) {
            const to = members[Math.floor(next() * index)] ?? member
            links.push({ id: `e${links.length}`, from: to, to: member })
          }
          members.push(member)
        }
        leaves.push(members)
      }
    }
  }
  for (let at = 0; at < 18; at++) {
    const from = leaves[Math.floor(next() * leaves.length)] ?? []
    const to = leaves[Math.floor(next() * leaves.length)] ?? []
    const source = from[Math.floor(next() * from.length)]
    const target = to[Math.floor(next() * to.length)]
    if (source && target && from !== to) {
      links.push({ id: `e${links.length}`, from: source, to: target })
    }
  }
  return { items, links, groups }
}
