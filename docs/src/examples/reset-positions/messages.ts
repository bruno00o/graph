export const messages = {
  graphLabel: 'Graph of sixty nodes placed by the x and y fields of their data',
  scatter: 'Scatter',
  resetAll: 'Put every node back',
  resetSelection: 'Put the selection back',
  hint: 'Drag a node, or Shift and drag the background to select several.',
  away: (count: number) =>
    count === 0
      ? 'Every node is where its data says.'
      : `${count} ${count === 1 ? 'node is' : 'nodes are'} away from ${count === 1 ? 'its' : 'their'} data.`,
} as const
