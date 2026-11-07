const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  title: (count: number, limit: number) =>
    `${numbers.format(count)} of ${numbers.format(limit)} selected`,
  group: (name: string) => `Group ${name}`,
} as const
