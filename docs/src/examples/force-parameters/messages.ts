const percent = new Intl.NumberFormat('en-US', { style: 'percent' })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes and ${edges} edges in communities`,
  settings: {
    edgeLength: (value: number) => `Edge length: ${value}`,
    repulsion: (value: number) => `Repulsion: ${value}`,
    gravity: (value: number) => `Gravity: ${value.toFixed(2)}`,
    spacing: (value: number) => `Spacing: ${value}`,
  },
  progress: (value: number) => `Laying out ${percent.format(value)}`,
  done: 'Settled',
  stopped: 'Restarted',
} as const
