const numbers = new Intl.NumberFormat('en-US')

function count(value: number, one: string, other: string): string {
  return `${numbers.format(value)} ${value === 1 ? one : other}`
}

export const messages = {
  graphLabel: 'Graph drawn from two TanStack DB collections',
  insert: 'Insert a node',
  update: 'Update a weight',
  remove: 'Delete a node',
  totals: (nodes: number, edges: number) =>
    `The collections hold ${count(nodes, 'node', 'nodes')} and ${count(edges, 'edge', 'edges')}.`,
  inserted: (label: string, anchor: string) => `Inserted ${label}, linked to ${anchor}.`,
  updated: (label: string, before: number, after: number) =>
    `Updated ${label}: weight ${numbers.format(before)} to ${numbers.format(after)}.`,
  removed: (label: string, edges: number) =>
    `Deleted ${label} and ${count(edges, 'edge', 'edges')}.`,
  node: (index: number) => `Node ${numbers.format(index)}`,
} as const
