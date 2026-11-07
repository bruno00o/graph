export interface Branch {
  readonly id: string
  readonly label: string
  readonly branch: string
  readonly depth: number
}

export interface Twig {
  readonly id: string
  readonly from: string
  readonly to: string
}

export function createTree(seed = 4): { items: Branch[]; links: Twig[] } {
  let state = seed
  const next = () => {
    state = (state * 16807) % 2147483647
    return state / 2147483647
  }
  const items: Branch[] = [{ id: 't0', label: 'Node 1', branch: 'root', depth: 0 }]
  const links: Twig[] = []
  let frontier: Branch[] = items.slice()
  for (let depth = 1; depth <= 4; depth++) {
    const born: Branch[] = []
    for (const parent of frontier) {
      const count =
        depth === 1 ? 5 : depth === 4 ? Math.floor(next() * 3) : 1 + Math.floor(next() * 3)
      for (let child = 0; child < count; child++) {
        const branch = depth === 1 ? String.fromCharCode(65 + child) : parent.branch
        const item = { id: `t${items.length}`, label: `Node ${items.length + 1}`, branch, depth }
        items.push(item)
        links.push({ id: `e${links.length}`, from: parent.id, to: item.id })
        born.push(item)
      }
    }
    frontier = born
  }
  return { items, links }
}
