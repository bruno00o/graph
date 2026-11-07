const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  hint: 'Hover a node or an edge',
  node: (label: string, neighbors: number) =>
    `${label}: ${numbers.format(neighbors)} ${neighbors === 1 ? 'neighbor' : 'neighbors'}`,
  edge: (from: string, to: string) => `Edge from ${from} to ${to}`,
} as const
