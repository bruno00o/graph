export const messages = {
  graphLabel: (nodes: number) => `${nodes} places in six areas, on a plain graph or on a map`,
  hub: (letter: string) => `Area ${letter}`,
  toMap: 'Show on the map',
  toCanvas: 'Back to the plain graph',
  legendTitle: 'Area',
  legendLabel: 'Legend of the areas',
} as const
