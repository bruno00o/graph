const numbers = new Intl.NumberFormat('en-US')
const decimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const zoomFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('en-US', { style: 'percent' })

export const messages = {
  graphLabel: 'Graph of 300 nodes with live statistics read from its store',
  panelLabel: 'Statistics of the graph',
  renders: (value: number) => `${numbers.format(value)} renders`,
  view: 'View',
  zoom: 'Zoom',
  zoomValue: (value: number) => `× ${zoomFormat.format(value)}`,
  center: 'Center',
  size: 'Size',
  point: (x: number, y: number) => `${decimals.format(x)}, ${decimals.format(y)}`,
  pixels: (width: number, height: number) =>
    `${numbers.format(width)} × ${numbers.format(height)} px`,
  pointer: 'Pointer',
  hovered: 'Hovered',
  edge: 'An edge',
  clicked: 'Last click',
  none: 'None',
  selection: 'Selection',
  nodes: 'Nodes',
  edges: 'Edges',
  count: (value: number) => numbers.format(value),
  layout: 'Layout',
  status: 'Status',
  idle: 'Idle',
  progress: (value: number) => `Running, ${percent.format(value)}`,
  moves: 'Position changes',
} as const
