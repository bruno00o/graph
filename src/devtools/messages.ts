import type { GraphIssue } from '../core/graph-model'
import type { Key } from '../types'

export interface GraphDevtoolsMessages {
  readonly title: string
  readonly empty: string
  readonly graph: string
  readonly graphName: (position: number, label: string) => string
  readonly performance: string
  readonly frameRate: string
  readonly framesPerSecond: (value: number) => string
  readonly idle: string
  readonly frame: string
  readonly frameChart: (count: number, max: number) => string
  readonly frameNote: (count: number, mean: number, max: number, budget: number) => string
  readonly flush: string
  readonly apply: string
  readonly sync: string
  readonly render: string
  readonly labelSelection: string
  readonly labelsDrawn: string
  readonly labelCounts: (nodes: number, edges: number) => string
  readonly textureMemory: string
  readonly elements: string
  readonly nodes: string
  readonly edges: string
  readonly pendingEdges: string
  readonly issues: string
  readonly issue: (issue: GraphIssue) => string
  readonly view: string
  readonly center: string
  readonly point: (x: number, y: number) => string
  readonly zoom: string
  readonly size: string
  readonly dimensions: (width: number, height: number) => string
  readonly interaction: string
  readonly selection: string
  readonly elementCounts: (nodes: number, edges: number) => string
  readonly hovered: string
  readonly focused: string
  readonly target: (kind: 'node' | 'edge', key: Key) => string
  readonly states: string
  readonly noStates: string
  readonly layout: string
  readonly running: (name: string, progress: number) => string
  readonly lastRuns: string
  readonly run: (name: string, duration: number, completed: boolean) => string
  readonly none: string
  readonly unknown: string
  readonly notMeasured: string
  readonly number: (value: number) => string
  readonly duration: (milliseconds: number) => string
  readonly bytes: (value: number) => string
}

const integer = new Intl.NumberFormat('en-US')
const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const tenth = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('en-US', { style: 'percent' })
const units = ['B', 'KB', 'MB', 'GB']

function plural(value: number, one: string, other: string): string {
  return `${integer.format(value)} ${value === 1 ? one : other}`
}

function duration(milliseconds: number): string {
  if (milliseconds >= 1000) return `${decimal.format(milliseconds / 1000)} s`
  return `${milliseconds < 100 ? tenth.format(milliseconds) : integer.format(milliseconds)} ms`
}

function bytes(value: number): string {
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024
    unit++
  }
  return `${decimal.format(amount)} ${units[unit]}`
}

export const defaultMessages: GraphDevtoolsMessages = {
  title: 'Graph',
  empty: 'No graph is mounted on this page.',
  graph: 'Graph',
  graphName: (position, label) => (label ? `#${position} ${label}` : `#${position}`),
  performance: 'Performance',
  frameRate: 'Frame rate',
  framesPerSecond: (value) => `${integer.format(value)} fps`,
  idle: 'Idle',
  frame: 'Last frame',
  frameChart: (count, max) =>
    `Time spent in each of the last ${plural(count, 'frame', 'frames')}, up to ${duration(max)}`,
  frameNote: (count, mean, max, budget) =>
    count === 0
      ? `Dashed line at ${duration(budget)}`
      : `Last ${plural(count, 'frame', 'frames')}: mean ${duration(mean)}, max ${duration(max)}. Dashed line at ${duration(budget)}`,
  flush: 'Flush',
  apply: 'Scene apply',
  sync: 'Renderer sync',
  render: 'Render',
  labelSelection: 'Label selection',
  labelsDrawn: 'Labels drawn',
  labelCounts: (nodes, edges) =>
    `${plural(nodes, 'node', 'nodes')}, ${plural(edges, 'edge', 'edges')}`,
  textureMemory: 'Texture memory',
  elements: 'Elements',
  nodes: 'Nodes',
  edges: 'Edges',
  pendingEdges: 'Pending edges',
  issues: 'Issues',
  issue: (issue) => {
    switch (issue.type) {
      case 'duplicate-key':
        return `Duplicate ${issue.kind === 'nodes' ? 'node' : 'edge'} key ${String(issue.key)}`
      case 'missing-key':
        return `${issue.kind === 'nodes' ? 'Node' : 'Edge'} without a key`
      case 'missing-parent':
        return `Node ${String(issue.key)} has no parent ${String(issue.parent)}`
      case 'parent-cycle':
        return `Node ${String(issue.key)} would contain itself through ${String(issue.parent)}`
    }
  },
  view: 'View',
  center: 'Center',
  point: (x, y) => `${decimal.format(x)}, ${decimal.format(y)}`,
  zoom: 'Zoom',
  size: 'Size',
  dimensions: (width, height) => `${integer.format(width)} × ${integer.format(height)} px`,
  interaction: 'Interaction',
  selection: 'Selection',
  elementCounts: (nodes, edges) =>
    `${plural(nodes, 'node', 'nodes')}, ${plural(edges, 'edge', 'edges')}`,
  hovered: 'Hovered',
  focused: 'Focused',
  target: (kind, key) => `${kind} ${String(key)}`,
  states: 'Named states',
  noStates: 'No named state',
  layout: 'Layout',
  running: (name, progress) => `${name}, ${percent.format(progress)}`,
  lastRuns: 'Last runs',
  run: (name, time, completed) => `${name}, ${duration(time)}${completed ? '' : ', stopped'}`,
  none: 'None',
  unknown: 'Unknown',
  notMeasured: 'Not measured yet',
  number: (value) => integer.format(value),
  duration,
  bytes,
}

export function resolveMessages(
  messages: Partial<GraphDevtoolsMessages> | undefined,
): GraphDevtoolsMessages {
  return messages ? { ...defaultMessages, ...messages } : defaultMessages
}
