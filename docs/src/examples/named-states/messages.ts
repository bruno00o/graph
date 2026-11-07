const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges where the neighbors of the selection stand out`,
  raise: (raise: boolean) => (raise ? 'Neighbors: drawn on top' : 'Neighbors: drawn in place'),
  empty: 'Click a node to bring out its neighbors',
  linked: (nodes: number, edges: number) =>
    `${numbers.format(nodes)} neighbors, ${numbers.format(edges)} edges between them`,
} as const
