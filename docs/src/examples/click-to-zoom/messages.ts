const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  hint: 'Click a node to zoom on it',
  framed: (label: string, neighbors: number) =>
    `${label} and its ${numbers.format(neighbors)} ${neighbors === 1 ? 'neighbor' : 'neighbors'}`,
} as const
