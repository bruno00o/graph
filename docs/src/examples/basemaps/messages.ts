export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Map of ${nodes} places in seven groups and ${edges} links, on a basemap you can switch`,
  place: (index: number) => `Place ${index}`,
  basemaps: {
    positron: 'Positron',
    liberty: 'Liberty',
    bright: 'Bright',
    dark: 'Dark',
    fiord: 'Fiord',
    satellite: 'Satellite',
  },
} as const
