export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes that come and go over several periods, and ${edges} edges that open and close`,
  node: (index: number) => `Node ${index}`,
  group: (index: number) => `Group ${String.fromCharCode(65 + index)}`,
  timeline: 'Timeline of the nodes and edges',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
  each: 'Periods: each one',
  whole: 'Periods: whole span',
} as const
