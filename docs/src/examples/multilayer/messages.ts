const numbers = new Intl.NumberFormat('en-US')

const count = (value: number, one: string, many: string) =>
  `${numbers.format(value)} ${value === 1 ? one : many}`

export const messages = {
  graphLabel: (places: number, routes: number) =>
    `Graph of ${count(places, 'place', 'places')} and ${count(routes, 'route', 'routes')}`,
  reset: 'Start over',
  layersTitle: 'Layers',
  layersLabel: 'Layers of the graph',
  layerNames: { lower: 'Segments', middle: 'Paths', upper: 'Routes' } as Record<string, string>,
  names: {
    upper: (order: number) => `Route ${numbers.format(order)}`,
    middle: (order: number) => `Path ${numbers.format(order)}`,
    lower: (order: number) => `Segment ${numbers.format(order)}`,
  },
  shown: (shown: number, total: number) =>
    `${numbers.format(shown)} of ${numbers.format(total)} edges shown`,
  edge: (name: string, capacity: number, carriers: number) =>
    `${name}, capacity ${numbers.format(capacity)}, ${
      carriers === 0 ? 'no carrier' : count(carriers, 'carrier', 'carriers')
    }`,
} as const
