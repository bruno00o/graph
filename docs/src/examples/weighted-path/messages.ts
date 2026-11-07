const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Grid of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges with costs`,
  hint: 'Click a node, then Shift and click another',
  noPath: 'No path joins these nodes',
  cost: (value: number) => numbers.format(value),
  found: (cost: number, edges: number) =>
    `Cost ${numbers.format(cost)} over ${numbers.format(edges)} ${edges === 1 ? 'edge' : 'edges'}`,
} as const
