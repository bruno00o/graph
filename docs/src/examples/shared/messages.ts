const numbers = new Intl.NumberFormat('en-US')

export function formatNumber(value: number): string {
  return numbers.format(value)
}

function count(value: number, one: string, other: string): string {
  return `${formatNumber(value)} ${value === 1 ? one : other}`
}

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${count(nodes, 'node', 'nodes')} and ${count(edges, 'edge', 'edges')}`,
  selection: (nodes: number, edges: number): string => {
    if (nodes === 0 && edges === 0) return 'Nothing selected'
    const parts: string[] = []
    if (nodes > 0) parts.push(count(nodes, 'node', 'nodes'))
    if (edges > 0) parts.push(count(edges, 'edge', 'edges'))
    return `${parts.join(' and ')} selected`
  },
  selected: 'Selected',
  emptySelection: 'Click a node, hold Shift to add more.',
  weight: (group: string, weight: number) => `Group ${group}, weight ${formatNumber(weight)}`,
  edgesLabel: 'Graph of five nodes linked by parallel edges and loops',
  route: (from: string, to: string) => `Edge from ${from} to ${to}`,
  imagesLabel: 'Graph of twelve nodes with pictures, icons, badges and outlines',
  backgroundsOn: 'Add label backgrounds',
  backgroundsOff: 'Remove label backgrounds',
  mute: 'Fade half the nodes',
  unmute: 'Show every node',
  resetPositions: 'Reset positions',
  exploreLabel: 'Graph explored step by step',
  loading: 'Loading',
  explored: (value: number) => count(value, 'node unfolded', 'nodes unfolded'),
  expanded: 'expanded',
}
