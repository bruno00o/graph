import type { Point, PositionOrigin, View } from '@bruno00o/graph'

const numbers = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const zooms = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function count(value: number, one: string, other: string): string {
  return `${numbers.format(value)} ${value === 1 ? one : other}`
}

const origins: Record<PositionOrigin, string> = {
  drag: 'by a drag',
  api: 'from code',
  layout: 'by a layout',
}

export const messages = {
  graphLabel: 'Graph of ninety nodes in four groups that reports its events',
  logLabel: 'Events',
  clear: 'Clear the log',
  background: 'background',
  none: 'none',
  edge: (from = '', to = '') => `edge from ${from} to ${to}`,
  at: (what: string, point: Point) =>
    `${what} at ${numbers.format(point.x)}, ${numbers.format(point.y)}`,
  drag: (label: string, moved: number) => `${label}, ${count(moved, 'node', 'nodes')} moving`,
  moved: (origin: PositionOrigin, moved: number) =>
    `${count(moved, 'node', 'nodes')} moved ${origins[origin]}`,
  elements: (nodes: number, edges: number) =>
    `${count(nodes, 'node', 'nodes')} and ${count(edges, 'edge', 'edges')} selected`,
  view: (view: View) =>
    `zoom ${zooms.format(view.zoom)}, center ${numbers.format(view.x)}, ${numbers.format(view.y)}`,
  repeated: (detail: string, times: number) => `${detail} (${numbers.format(times)} times)`,
} as const
