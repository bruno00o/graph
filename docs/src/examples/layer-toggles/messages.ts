export const messages = {
  graphLabel: (nodes: number, satellites: number) =>
    `Graph of ${nodes} nodes and ${satellites} satellites in four layers`,
  center: 'Center',
  node: (index: number) => `Node ${index}`,
  satellite: (index: number) => `Satellite ${index}`,
  layers: { rim: 'Rim', spokes: 'Spokes', chords: 'Chords', satellites: 'Satellites' },
} as const
