const degrees = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes placed by longitude and latitude, linked by ${edges} edges`,
  node: (index: number) => `Node ${index}`,
  farEdges: (geodesic: boolean) => `Long edges: ${geodesic ? 'great circles' : 'straight'}`,
  place: (label: string, longitude: number, latitude: number) =>
    `${label}: longitude ${degrees.format(longitude)}°, latitude ${degrees.format(latitude)}°`,
} as const
