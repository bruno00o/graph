const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  hint: 'Click a node, then Shift and click the next stops in order',
  stop: (order: number) => numbers.format(order),
  broken: (from: number, to: number) =>
    `No path from stop ${numbers.format(from)} to stop ${numbers.format(to)}`,
  route: (legs: number, length: number) =>
    `${numbers.format(legs)} ${legs === 1 ? 'leg' : 'legs'}, length ${numbers.format(length)}`,
} as const
