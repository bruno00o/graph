export const messages = {
  graphLabel: (anchors: number, free: number) =>
    `Graph of ${anchors} fixed anchors and ${free} free nodes`,
  anchor: (name: string) => `Anchor ${name}`,
  node: (index: number) => `Node ${index}`,
  shape: (name: string) => `Anchors: ${name}`,
  shapes: { ring: 'in a ring', row: 'in a row', corners: 'in two columns' },
  settle: 'Lay out again',
} as const
