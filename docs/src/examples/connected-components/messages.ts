const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges in separate parts`,
  summary: (count: number, largest: number) =>
    `${numbers.format(count)} components, the largest with ${numbers.format(largest)} nodes`,
  component: (size: number) =>
    `Component of ${numbers.format(size)} ${size === 1 ? 'node' : 'nodes'}`,
} as const
