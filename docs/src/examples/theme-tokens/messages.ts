const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges in six groups`,
  palette: (name: string) => `Palette: ${name}`,
  palettes: { dusk: 'dusk', meadow: 'meadow', library: 'library default' },
} as const
