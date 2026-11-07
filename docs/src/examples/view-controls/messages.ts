import type { Point } from '@bruno00o/graph'

const numbers = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const zooms = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

const pair = ({ x, y }: Point) => `${numbers.format(x)}, ${numbers.format(y)}`

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges in six groups`,
  fitGroup: (group: string) => `Fit group ${group}`,
  fitSelection: 'Fit the selection',
  reset: 'Zoom 1 at the origin',
  zoomIn: '+',
  zoomInLabel: 'Zoom in',
  zoomOut: '−',
  zoomOutLabel: 'Zoom out',
  zoom: (value: number) => zooms.format(value),
  origin: '0, 0',
  center: (center: Point) => `Center at ${pair(center)} in world units`,
  pointer: (point: Point) => `Pointer at ${pair(point)} in world units`,
} as const
