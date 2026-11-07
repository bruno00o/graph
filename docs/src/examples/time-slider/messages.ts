const date = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes and ${edges} edges that exist over periods of four years`,
  slider: 'Moment shown',
  moment: (time: number) => date.format(time),
  status: (time: number, nodes: number) => `${date.format(time)}: ${nodes} nodes exist`,
} as const
