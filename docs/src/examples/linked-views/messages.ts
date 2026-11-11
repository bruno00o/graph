const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  overviewLabel: (nodes: number, edges: number) =>
    `Overview of a graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  detailLabel: (nodes: number, edges: number) =>
    `Detail of a graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  overview: 'Overview',
  detail: 'Detail',
  frame: 'Area shown in the detail. Drag it, or move it with the arrow keys.',
} as const
