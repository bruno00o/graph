export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Map of ${nodes} nodes in five groups and ${edges} edges that appear over four years`,
  node: (index: number) => `Node ${index}`,
  legendTitle: 'Group',
  legendLabel: 'Legend of the groups',
  timeline: 'Timeline of the nodes and edges',
  timelineLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
    range: (start: string, end: string) => `from ${start} to ${end}`,
  },
} as const
