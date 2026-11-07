const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number) => `Graph of ${numbers.format(nodes)} nodes in six groups`,
  legendLabel: 'Legend of the groups',
  title: 'Groups',
  group: (value: string) => `Group ${value}`,
  count: (value: number) => numbers.format(value),
  reset: 'Show every group',
} as const
