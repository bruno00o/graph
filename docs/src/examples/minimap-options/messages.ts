const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges with a minimap`,
  corner: (name: string) => `Corner: ${name}`,
  corners: { bottomRight: 'bottom right', bottomLeft: 'bottom left', topRight: 'top right' },
  size: (name: string) => `Size: ${name}`,
  sizes: { small: 'small', large: 'large' },
  edges: (shown: boolean) => (shown ? 'Edges: drawn' : 'Edges: left out'),
  colors: (name: string) => `Colors: ${name}`,
  colorModes: { graph: 'from the graph', single: 'one color' },
} as const
