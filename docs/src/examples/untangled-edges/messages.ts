const count = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Twelve clusters of ${nodes} nodes and ${edges} edges`,
  mode: { untangled: 'Lay out and untangle', plain: 'Lay out without untangling' },
  running: 'Laying out',
  crossings: (value: number) =>
    value === 1 ? '1 edge crossing' : `${count.format(value)} edge crossings`,
} as const
