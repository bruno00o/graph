export const messages = {
  graphLabel: (nodes: number) => `${nodes} places in seven areas, by longitude and latitude`,
  node: (index: number) => `Place ${index}`,
  hub: (letter: string) => `Area ${letter}`,
  spread: 'Overlaps: moved apart',
  pinned: 'Overlaps: left in place',
  spacing: (value: number) => `Spacing: ${value}`,
} as const
