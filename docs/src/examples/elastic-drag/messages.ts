const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  mode: (elastic: boolean) => (elastic ? 'Neighbors: follow' : 'Neighbors: stay'),
  followed: (count: number) =>
    `${numbers.format(count)} ${count === 1 ? 'node' : 'nodes'} followed the last drag`,
} as const
