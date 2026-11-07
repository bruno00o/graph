export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes that exist over periods, and ${edges} edges that each happen at one moment`,
  node: (index: number) => `Node ${index}`,
  timeline: 'Timeline of the nodes and edges',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
  fade: (days: number) => (days === 0 ? 'Fade: none' : `Fade: ${days} days`),
} as const
