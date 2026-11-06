import type { GraphIssue } from '../core/graph-model'
import type { Key } from '../types'

/** Every text the devtools panel shows. Strings are labels; functions format values. */
export interface GraphDevtoolsMessages {
  /**
   * Name of the panel in the devtools.
   * @default 'Graph'
   */
  readonly title: string
  /**
   * Shown when no graph is mounted.
   * @default 'No graph is mounted on this page.'
   */
  readonly empty: string
  /**
   * Label of the graph picker.
   * @default 'Graph'
   */
  readonly graph: string
  /**
   * Name of a graph: its number in mount order, then its `aria-label`, such as `'#1 Sample graph'`.
   */
  readonly graphName: (position: number, label: string) => string
  /**
   * Title of the Performance section.
   * @default 'Performance'
   */
  readonly performance: string
  /**
   * Label of the frames drawn during the last second.
   * @default 'Frame rate'
   */
  readonly frameRate: string
  /** Formats the frame rate, such as `'60 fps'`. */
  readonly framesPerSecond: (value: number) => string
  /**
   * Frame rate when no frame was drawn during the last second.
   * @default 'Idle'
   */
  readonly idle: string
  /**
   * Label of the time of the last frame.
   * @default 'Last frame'
   */
  readonly frame: string
  /** Accessible name of the frame chart. */
  readonly frameChart: (count: number, max: number) => string
  /** Caption of the frame chart, with the mean, the maximum and the budget of a frame. */
  readonly frameNote: (count: number, mean: number, max: number, budget: number) => string
  /**
   * Label of the last flush of the graph model.
   * @default 'Flush'
   */
  readonly flush: string
  /**
   * Label of the update of the render columns that followed.
   * @default 'Scene apply'
   */
  readonly apply: string
  /**
   * Label of the upload of changed columns in the last frame.
   * @default 'Renderer sync'
   */
  readonly sync: string
  /**
   * Label of the draw calls of the last frame.
   * @default 'Render'
   */
  readonly render: string
  /**
   * Label of the last selection of visible labels.
   * @default 'Label selection'
   */
  readonly labelSelection: string
  /**
   * Label of the node and edge labels kept by that selection.
   * @default 'Labels drawn'
   */
  readonly labelsDrawn: string
  /** Formats the labels drawn, such as `'3 nodes, 0 edges'`. */
  readonly labelCounts: (nodes: number, edges: number) => string
  /**
   * Label of the size of the textures the renderer allocated.
   * @default 'Texture memory'
   */
  readonly textureMemory: string
  /**
   * Title of the Elements section.
   * @default 'Elements'
   */
  readonly elements: string
  /**
   * Label of the node count.
   * @default 'Nodes'
   */
  readonly nodes: string
  /**
   * Label of the edge count.
   * @default 'Edges'
   */
  readonly edges: string
  /**
   * Label of the count of edges waiting for an end.
   * @default 'Pending edges'
   */
  readonly pendingEdges: string
  /**
   * Label of the issues of the flushes timed while a panel watched.
   * @default 'Issues'
   */
  readonly issues: string
  /** Formats an issue, such as `'Duplicate node key a'`. */
  readonly issue: (issue: GraphIssue) => string
  /**
   * Title of the View section.
   * @default 'View'
   */
  readonly view: string
  /**
   * Label of the center of the view.
   * @default 'Center'
   */
  readonly center: string
  /** Formats a point, such as `'12.5, -4'`. */
  readonly point: (x: number, y: number) => string
  /**
   * Label of the zoom.
   * @default 'Zoom'
   */
  readonly zoom: string
  /**
   * Label of the size of the canvas.
   * @default 'Size'
   */
  readonly size: string
  /** Formats a size, such as `'800 × 600 px'`. */
  readonly dimensions: (width: number, height: number) => string
  /**
   * Title of the Interaction section.
   * @default 'Interaction'
   */
  readonly interaction: string
  /**
   * Label of the selection counts.
   * @default 'Selection'
   */
  readonly selection: string
  /** Formats node and edge counts, such as `'3 nodes, 0 edges'`. */
  readonly elementCounts: (nodes: number, edges: number) => string
  /**
   * Label of the hovered element.
   * @default 'Hovered'
   */
  readonly hovered: string
  /**
   * Label of the focused element.
   * @default 'Focused'
   */
  readonly focused: string
  /** Formats an element, such as `'node a'`. */
  readonly target: (kind: 'node' | 'edge', key: Key) => string
  /**
   * Title of the section of the free states.
   * @default 'Named states'
   */
  readonly states: string
  /**
   * Shown when the graph declares no free state.
   * @default 'No named state'
   */
  readonly noStates: string
  /**
   * Title of the Layout section.
   * @default 'Layout'
   */
  readonly layout: string
  /** Formats the running layout, such as `'force, 40%'`. */
  readonly running: (name: string, progress: number) => string
  /**
   * Label of the last layout runs.
   * @default 'Last runs'
   */
  readonly lastRuns: string
  /**
   * Formats a past run, such as `'force, 1.2 s'`, followed by `', stopped'` when it did not
   * complete.
   */
  readonly run: (name: string, duration: number, completed: boolean) => string
  /**
   * Shown for no element.
   * @default 'None'
   */
  readonly none: string
  /**
   * Shown for a value the renderer does not report.
   * @default 'Unknown'
   */
  readonly unknown: string
  /**
   * Shown for a step not timed yet.
   * @default 'Not measured yet'
   */
  readonly notMeasured: string
  /** Formats a number, such as `'1,234'`. */
  readonly number: (value: number) => string
  /** Formats milliseconds, such as `'0.4 ms'`, or seconds from 1,000 ms, such as `'1.2 s'`. */
  readonly duration: (milliseconds: number) => string
  /** Formats a size in bytes, such as `'8.5 MB'`. */
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

/** The English texts of the devtools panel. */
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
