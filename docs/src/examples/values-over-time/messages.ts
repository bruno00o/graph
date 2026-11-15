const date = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: 'numeric',
})

const kinds: Readonly<Record<string, string>> = {
  state: 'State',
  level: 'Level',
}

export const messages = {
  graphLabel: (nodes: number, changes: number) =>
    `Graph of ${nodes} nodes whose state and level follow ${changes} changes over thirty days`,
  node: (index: number) => `Node ${index}`,
  timeline: 'Journal of the changes',
  labels: {
    play: 'Replay',
    cursor: 'Moment shown',
    kinds: 'Kinds of change shown',
  },
  kind: (kind: string) => kinds[kind] ?? kind,
  moment: (time: number) => date.format(time),
  latest: 'Latest values',
  state: (node: string, state: string) => `${node} is now ${state}`,
  level: (node: string, level: number) => `${node} goes to level ${level}`,
  quiet: 'No change at this moment.',
} as const
