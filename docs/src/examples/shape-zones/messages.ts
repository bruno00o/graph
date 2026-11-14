export const messages = {
  graphLabel: (nodes: number, shapes: number) =>
    `Graph of ${nodes} nodes placed over ${shapes} shapes: an area with a hole, a ring, a rounded rectangle and a dashed line`,
  frame: (name: string) => `Frame: ${name}`,
  frames: {
    all: 'everything',
    court: 'the area',
    ring: 'the ring',
    block: 'the rectangle',
    trail: 'the line',
  },
  outline: (name: string) => `Outline: ${name}`,
  outlines: { solid: 'solid', dashed: 'dashed', dotted: 'dotted' },
  legendTitle: 'Zone',
  legendLabel: 'Zones of the shapes and nodes',
} as const
