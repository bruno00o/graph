const distance = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, shapes: number) =>
    `Map of ${nodes} places and ${shapes} shapes in degrees: areas, circles in kilometers and a dashed line across the antimeridian`,
  spot: (index: number) => `Place ${index}`,
  area: (index: number) => `Area ${index}`,
  reach: (place: string, kilometers: number) => `${distance.format(kilometers)} km around ${place}`,
  route: 'Line across the antimeridian',
  frame: 'Frame the antimeridian',
  projection: (name: string) => `Projection: ${name}`,
  projections: { globe: 'globe', mercator: 'flat map' },
} as const
