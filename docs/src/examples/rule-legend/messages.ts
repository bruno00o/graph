const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, links: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(links)} links colored by rules`,
  legendLabel: 'Legend of the rules',
  nodeTitle: 'Node weight',
  edgeTitle: 'Link strength',
  stateTitle: 'State',
  heavy: 'Heavy, 40 and above',
  medium: 'Medium, 12 to 39',
  light: 'Light, below 12',
  strong: 'Strong, 0.85 and above',
  weak: 'Weak, below 0.85',
  selected: 'Selected',
} as const
