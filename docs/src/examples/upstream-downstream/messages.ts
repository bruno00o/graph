const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Directed graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges in layers`,
  hint: 'Click a node',
  counts: (up: number, down: number) =>
    `${numbers.format(up)} upstream, ${numbers.format(down)} downstream`,
} as const
