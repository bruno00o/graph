const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Mesh of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} weighted edges`,
  hint: 'Click a node to start from it',
  budget: (value: number) => `Budget ${numbers.format(value)}`,
  reached: (count: number) =>
    `${numbers.format(count)} ${count === 1 ? 'node' : 'nodes'} within the budget`,
} as const
