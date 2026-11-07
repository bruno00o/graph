const shapeNames = { arc: 'arcs', gap: 'gaps', off: 'plain' } as const

export const messages = {
  graphLabel: (edges: number) => `Graph of ${edges} straight edges that cross each other`,
  shape: (shape: keyof typeof shapeNames) => `Crossings: ${shapeNames[shape]}`,
  size: (value: number) => `Size: ${value} px`,
} as const
