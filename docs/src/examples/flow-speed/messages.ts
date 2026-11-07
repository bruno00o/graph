const speed = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes in three columns, linked by ${edges} edges that flow at their own speed`,
  node: (index: number) => `Node ${index}`,
  speed: (value: number) => `${speed.format(value)} px/s`,
  reverse: 'Reverse every flow',
  factor: (value: number) => `Speed: ×${value}`,
  pause: 'Pause',
  resume: 'Resume',
} as const
