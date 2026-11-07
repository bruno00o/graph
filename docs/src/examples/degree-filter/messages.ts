const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges, sized by degree`,
  least: (value: number) => `Degree at least ${numbers.format(value)}`,
  shown: (shown: number, total: number) =>
    `${numbers.format(shown)} of ${numbers.format(total)} nodes shown`,
} as const
