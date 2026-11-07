const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: 'Graph that grows as a live source streams its nodes and edges',
  pause: 'Pause',
  resume: 'Resume',
  restart: 'Stream again',
  progress: (sent: number, total: number, batch: number, every: number) =>
    `${numbers.format(sent)} of ${numbers.format(total)} nodes, ${numbers.format(batch)} every ${numbers.format(every)} ms`,
} as const
