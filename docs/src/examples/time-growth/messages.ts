const date = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes and ${edges} edges that join over three years`,
  node: (index: number) => `Node ${index}`,
  timeline: 'Timeline of the nodes and edges',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
  status: (until: number, shown: number, fresh: number) =>
    `${date.format(until)}: ${shown} nodes, ${fresh} joined in the last 60 days`,
} as const
