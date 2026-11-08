const percent = new Intl.NumberFormat('en-US', { style: 'percent' })
const seconds = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const messages = {
  graphLabel: (nodes: number, edges: number) => `Grid of ${nodes} nodes and ${edges} edges`,
  mode: { levels: 'Lay out in levels', single: 'Lay out in a single level' },
  progress: (value: number) => `Laying out ${percent.format(value)}`,
  done: (value: number) => `Settled in ${seconds.format(value)} s`,
  stopped: 'Restarted',
} as const
