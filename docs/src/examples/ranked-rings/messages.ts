export const messages = {
  graphLabel: (nodes: number) => `Rings of ${nodes} nodes in five groups`,
  rank: (name: string) => `Rank by: ${name}`,
  ranks: { weight: 'weight', degree: 'degree', group: 'group, then weight' },
  reset: 'First node in the middle',
  weight: (value: number) => String(value),
} as const
