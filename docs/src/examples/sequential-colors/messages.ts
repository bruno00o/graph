export const messages = {
  graphLabel: (nodes: number) =>
    `Lattice of ${nodes} nodes colored by a value from 0 to 100 that rises in three places`,
  legendLabel: 'Color by value',
  legendTitle: 'Value',
  value: (value: number) => String(value),
  mode: (name: string) => `Colors: ${name}`,
  modes: {
    two: 'two stops over 0 to 100',
    three: 'three stops over 0 to 100',
    clamped: 'two stops over 40 to 60',
    theme: 'default range over the data',
  },
} as const
