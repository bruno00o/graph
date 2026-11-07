const numbers = new Intl.NumberFormat('en-US')
const percent = new Intl.NumberFormat('en-US', { style: 'percent' })
const seconds = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const zoomFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

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
  endsLabel: 'Graph of six nodes linked by exchanges in both directions',
  endsHint: 'Each half of an edge follows what its node sends.',
  endSplit: (mode: string) => `Split: ${mode}`,
  endSplitModes: { half: 'halfway', share: 'by volume' },
  endLabels: (mode: string) => `End labels: ${mode}`,
  sent: (node: string, value: number) => `Node ${node} sends ${value}`,
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
  groupsOn: 'Nest the branches in groups',
  groupsOff: 'Remove the groups',
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
  lensHint: 'Hold Alt (⌥) over the graph. Scroll over the lens to change its magnification.',
  lensShown: (zoom: number) => `Lens ×${zoomFormat.format(zoom)}`,
  lensFixed: 'Fixed lens',
  lensHide: 'Hide the lens',
  mapLabel: (places: number) =>
    `Map of ${count(places, 'place', 'places')} and the routes between them`,
  place: (index: number) => `Place ${formatNumber(index)}`,
  projection: (name: string) => `Projection: ${name}`,
  projections: { globe: 'globe', mercator: 'flat' },
  farRoutes: (name: string) => `Long routes: ${name}`,
  farRouteModes: { geodesic: 'great circles', straight: 'straight' },
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
  routingMode: (name: string) => `Edges: ${name}`,
  routingModes: { orthogonal: 'orthogonal', straight: 'straight' },
  bridgeMode: (name: string) => `Crossings: ${name}`,
  bridgeModes: { arc: 'arcs', gap: 'gaps', off: 'plain' },
  cornerMode: (name: string) => `Corners: ${name}`,
  cornerModes: { '6': 'rounded', '0': 'square' },
  routing: 'Routing…',
  routed: (duration: number) => `Routed in ${formatNumber(Math.round(duration))} ms`,
  timeLabel: 'Timeline of the nodes and edges',
  timeLabels: {
    play: 'Play',
    start: 'Start of the window',
    end: 'End of the window',
    window: 'Window',
  },
  timeRange: (start: string, end: string) => `from ${start} to ${end}`,
  timeWindow: (start: number | null, end: number | null) =>
    start === null && end === null
      ? 'All time'
      : start === null
        ? `Until ${dateFormat.format(end ?? 0)}`
        : end === null
          ? `Since ${dateFormat.format(start)}`
          : `${dateFormat.format(start)} to ${dateFormat.format(end)}`,
  timeMode: (name: string) => `Playback: ${name}`,
  timeModes: { slide: 'sliding window', grow: 'cumulative' },
  showAll: 'Show all',
  zoomTiers: (zoom: number, shown: number) =>
    `Zoom ${zoomFormat.format(zoom)}, ${shown} of 3 ${shown === 1 ? 'tier' : 'tiers'} shown`,
  layersTitle: 'Layers',
  layersLabel: 'Layers of the graph',
  layerNames: { lower: 'Segments', middle: 'Paths', upper: 'Routes' } as Record<string, string>,
  supportHint: 'Click an edge: what carries it lights below, what it carries lights above.',
  supportStatus: (carriers: number, carried: number) =>
    `${count(carriers, 'carrier', 'carriers')}, ${count(carried, 'carried edge', 'carried edges')}`,
  transformsLabel: (items: number, links: number) =>
    `Graph of ${count(items, 'item', 'items')} in four sectors, linked by ${count(links, 'exchange', 'exchanges')}`,
  transformsHint: 'Hover the two halves of a merged line. Click a family in the legend to hide it.',
  itemName: (index: number) => `Item ${formatNumber(index)}`,
  sectorName: (value: string) => `Sector ${value}`,
  familiesTitle: 'Families',
  familiesLabel: 'Families of the items',
  familyName: (value: string) => `Family ${value}`,
  mergeToggle: (merged: boolean) => `Parallel edges: ${merged ? 'merged' : 'apart'}`,
  sectorToggle: (grouped: boolean) => `Sectors: ${grouped ? 'grouped' : 'items'}`,
  sectorStatus: (value: string, items: number) =>
    `Sector ${value}: ${count(items, 'item', 'items')}`,
  mergedStatus: (from: string, to: string, forward: number, backward: number) =>
    backward === 0
      ? `${from} to ${to}: ${count(forward, 'exchange', 'exchanges')}`
      : `${from} to ${to}: ${formatNumber(forward)}, back: ${formatNumber(backward)}`,
}
