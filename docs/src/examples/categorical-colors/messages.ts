const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges colored by group`,
  legendLabel: 'Colors by group',
  legendTitle: 'Group',
  group: (name: string) => `Group ${name}`,
  mode: (name: string) => `Colors: ${name}`,
  modes: {
    appearance: 'in order of appearance',
    domain: 'pinned by a domain',
    range: 'a range of shades',
    single: 'a function for one group',
  },
} as const
