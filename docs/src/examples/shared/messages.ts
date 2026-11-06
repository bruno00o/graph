const numbers = new Intl.NumberFormat('en-US')
const percent = new Intl.NumberFormat('en-US', { style: 'percent' })
const seconds = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

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
  edgeName: (index: number) => `link ${formatNumber(index)}`,
  edgeLabels: (mode: string) => `Edge labels: ${mode}`,
  edgeLabelModes: { none: 'hidden', plain: 'along the line', plated: 'on a plate' },
  layoutProgress: (value: number) => `Laying out ${percent.format(value)}`,
  layoutDone: (value: number) => `Laid out in ${seconds.format(value)} s`,
  layoutStopped: 'Layout stopped',
  runAgain: 'Run again',
  stop: 'Stop',
  grow: 'Add ten nodes',
  nodeCount: (value: number) => `Nodes: ${formatNumber(value)}`,
  engine: (name: string) => `Engine: ${name}`,
  engines: { auto: 'automatic', gpu: 'GPU', cpu: 'CPU' },
  layoutKind: (name: string) => `Layout: ${name}`,
  layoutKinds: { force: 'force', grid: 'grid', rings: 'rings', radial: 'radial' },
  arrange: 'Arrange the selection',
  node: (index: number) => `Node ${formatNumber(index)}`,
  labelsLabel: 'Graph of twelve nodes with labels of varied sizes, colors and placements',
  longLabel: (index: number) => `Node with a particularly long label ${index}`,
  twoLines: (index: number) => `Node ${index}\non two lines`,
  group: (name: string) => `Group ${name}`,
  placement: (value: string) => `Placement: ${value}`,
  placements: { bottom: 'bottom', top: 'top', right: 'right', left: 'left', center: 'center' },
  truncateOn: 'Truncate long labels',
  truncateOff: 'Show full labels',
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
  filterLabel: 'Graph filtered by a TanStack DB collection',
  filterWeight: (value: number) => `Minimum weight: ${formatNumber(value)}`,
  raiseWeight: 'Raise by one',
  filterGroup: (name: string) => `Group: ${name}`,
  allGroups: 'all',
  filterSource: (name: string) => `Source: ${name}`,
  filterSources: { subset: 'filtered subscription', query: 'live query' },
  filterTiming: (database: number, graph: number) =>
    `TanStack DB ${formatNumber(Math.round(database))} ms, graph ${formatNumber(Math.round(graph))} ms`,
  linksLoaded: (value: number) => count(value, 'edge loaded', 'edges loaded'),
  unload: 'Unload edges',
}
