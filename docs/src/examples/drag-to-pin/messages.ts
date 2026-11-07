const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  pinned: (count: number) => `${numbers.format(count)} ${count === 1 ? 'node' : 'nodes'} pinned`,
} as const
