const numbers = new Intl.NumberFormat('en-US')

const plural = (count: number, one: string, many: string) =>
  `${numbers.format(count)} ${count === 1 ? one : many}`

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  selection: (nodes: number, edges: number) => {
    if (nodes === 0 && edges === 0) return 'Nothing selected'
    const parts: string[] = []
    if (nodes > 0) parts.push(plural(nodes, 'node', 'nodes'))
    if (edges > 0) parts.push(plural(edges, 'edge', 'edges'))
    return `${parts.join(' and ')} selected`
  },
  mode: (drawing: boolean) => (drawing ? 'Pan without Shift' : 'Lasso without Shift'),
} as const
