export const messages = {
  graphLabel: (nodes: number) => `Grid of ${nodes} nodes in six groups`,
  sort: (name: string) => `Sort: ${name}`,
  sorts: { group: 'group, then weight', weight: 'weight', degree: 'degree' },
  weight: (value: number) => String(value),
  columns: (count: number) => `Columns: ${count}`,
} as const
