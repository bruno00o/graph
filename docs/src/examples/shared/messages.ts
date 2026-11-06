const numbers = new Intl.NumberFormat('en-US')
const percent = new Intl.NumberFormat('en-US', { style: 'percent' })
const seconds = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const zoomFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function formatNumber(value: number): string {
  return numbers.format(value)
}

function count(value: number, one: string, other: string): string {
  return `${formatNumber(value)} ${value === 1 ? one : other}`
}

export const messages = {
  legendLabel: 'Legend',
  legendGroup: 'Group',
  legendWeight: 'Weight',
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
  layoutKinds: { layers: 'layers', force: 'force', grid: 'grid', rings: 'rings', radial: 'radial' },
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
  direction: (name: string) => `Direction: ${name}`,
  directions: { down: 'down', up: 'up', right: 'right', left: 'left' },
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
  background: (name: string) => `Background: ${name}`,
  backgrounds: { lines: 'lines', dots: 'dots', none: 'none' },
  hulls: (name: string) => `Hulls: ${name}`,
  hullModes: { groups: 'by group', selection: 'selection', none: 'none' },
  hullShape: (name: string) => `Shape: ${name}`,
  hullShapes: { rounded: 'rounded', smooth: 'smooth' },
  frameSelection: 'Frame',
  clearSelection: 'Clear',
  selectionCount: (value: number) => count(value, 'node', 'nodes'),
  groupsLabel: 'Graph of nodes in nested groups',
  subgroup: (name: string) => `Subgroup ${name}`,
  member: (name: string) => `Node ${name}`,
  foldAll: 'Fold all',
  unfoldAll: 'Unfold all',
  foldedGroups: (value: number) => count(value, 'group folded', 'groups folded'),
  mergedEdges: (value: number, from: string, to: string) =>
    `${count(value, 'edge', 'edges')} from ${from} to ${to}`,
  exportLabel: 'Graph of ten nodes with icons, badges, parallel edges and a loop',
  downloadPng: 'Download PNG',
  downloadSvg: 'Download SVG',
  exportRegion: (name: string) => `Region: ${name}`,
  exportRegions: { view: 'view', graph: 'whole graph' },
  exportLabels: (name: string) => `Labels: ${name}`,
  exportLabelModes: { visible: 'as shown', all: 'all' },
  wheelMode: (name: string) => `Wheel: ${name}`,
  wheelModes: { page: 'scrolls the page', pan: 'moves the view', zoom: 'zooms' },
  boundsMode: (name: string) => `Bounds: ${name}`,
  boundsModes: { nodes: 'around the nodes', none: 'none' },
  zoomHint: (key: 'Meta' | 'Control') =>
    key === 'Meta' ? 'Hold ⌘ and scroll to zoom' : 'Hold Ctrl and scroll to zoom',
  zoomLevel: (zoom: number) => `Zoom ×${zoomFormat.format(zoom)}`,
  pathsLabel: 'Graph of a thousand nodes where a path joins two selected nodes',
  pathHint: 'Click a node, then Shift and click another.',
  pathFound: (edges: number, duration: number) =>
    `Path of ${count(edges, 'edge', 'edges')}, found in ${seconds.format(duration)} ms`,
  noPath: (duration: number) => `No path, searched in ${seconds.format(duration)} ms`,
  pathMode: (name: string) => `Path: ${name}`,
  pathModes: { hops: 'fewest edges', distance: 'shortest distance' },
  mapLabel: (places: number) =>
    `Map of ${count(places, 'place', 'places')} and the routes between them`,
  place: (index: number) => `Place ${formatNumber(index)}`,
  flowsOn: 'Start flows',
  flowsOff: 'Stop flows',
  exported: (format: string, bytes: number, duration: number) =>
    `${format}, ${formatNumber(Math.max(1, Math.round(bytes / 1024)))} kB in ${formatNumber(Math.round(duration))} ms`,
  bundlingOn: 'Bundling: on',
  bundlingOff: 'Bundling: off',
  bundleStrength: (name: string) => `Strength: ${name}`,
  bundleStrengths: { '0.5': 'low', '0.85': 'medium', '1': 'full' },
  bundleReach: (name: string) => `Reach: ${name}`,
  bundleReaches: { '0.03': 'short', '0.06': 'medium', '0.12': 'long' },
  bundling: 'Bundling…',
  bundled: (duration: number) => `Bundled in ${formatNumber(Math.round(duration))} ms`,
}
