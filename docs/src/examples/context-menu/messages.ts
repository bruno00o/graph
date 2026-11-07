const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  graph: 'Graph',
  selectNeighbors: 'Select with its neighbors',
  frame: 'Zoom on its neighborhood',
  mark: 'Mark',
  unmark: 'Unmark',
  hide: 'Hide',
  showHidden: 'Show hidden nodes',
  clearMarks: 'Clear the marks',
  fit: 'Fit the whole graph',
} as const
