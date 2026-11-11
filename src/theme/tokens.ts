import type { Extent } from '../scales/extent'
import type { BuiltInState, StateStyle } from '../types'

export const lightTheme: Readonly<Record<string, string>> = {
  paper: '#f7f7f4',
  'paper-raised': '#ffffff',
  grid: '#c4e0dd',
  'grid-major': '#9fc8c4',
  ink: '#191d22',
  'ink-muted': '#5b6167',
  node: '#474e55',
  edge: '#7f858c',
  'group-fill': '#e7efee',
  'group-line': '#6e8d8b',
  'shape-fill': '#5b61671a',
  'shape-stroke': '#868c92',
  accent: '#c93700',
  'on-accent': '#ffffff',
  'focus-ring': '#c93700',
  halo: '#c9370047',
  'label-halo': '#f7f7f4',
  'label-background': '#ffffff',
  'node-ring': '#f7f7f4',
  'badge-fill': '#191d22',
  'badge-ink': '#f7f7f4',
  'lens-fill': '#f7f7f4',
  'lens-ring': '#5b6167',
  'lens-shadow': '#191d2229',
  'cat-1': '#2769b7',
  'cat-2': '#a47c13',
  'cat-3': '#12867c',
  'cat-4': '#9b357f',
  'cat-5': '#4189ad',
  'cat-6': '#448335',
  'cat-7': '#5d4099',
  'cat-8': '#745338',
  'cat-9': '#b64464',
  'cat-10': '#626a09',
  'cat-11': '#7471d6',
  'cat-12': '#a66bb9',
}

export const defaultFont = 'system-ui, sans-serif'

export function themeColor(name: string): string {
  return `var(--graph-${name})`
}

export const categoricalRange: readonly string[] = Array.from({ length: 12 }, (_, index) =>
  themeColor(`cat-${index + 1}`),
)

export const sequentialRange: readonly string[] = [themeColor('cat-5'), themeColor('cat-1')]

export interface Defaults {
  readonly nodeSize: number
  readonly nodeSizeRange: Extent
  readonly nodeFill: string
  readonly nodeStroke: string
  readonly nodeStrokeWidth: number
  readonly nodeOutline: string
  readonly nodeOutlineWidth: number
  readonly labelBackground: string
  readonly edgeWidth: number
  readonly edgeWidthRange: Extent
  readonly edgeColor: string
  readonly badgeFill: string
  readonly badgeInk: string
  readonly badgeRing: string
  readonly groupFill: string
  readonly groupStroke: string
  readonly groupStrokeWidth: number
  readonly groupPadding: number
  readonly shapeFill: string
  readonly shapeStroke: string
}

export const defaults: Defaults = {
  nodeSize: 16,
  nodeSizeRange: [8, 32],
  nodeFill: themeColor('node'),
  nodeStroke: themeColor('node-ring'),
  nodeStrokeWidth: 1,
  nodeOutline: themeColor('node-ring'),
  nodeOutlineWidth: 2,
  labelBackground: themeColor('label-background'),
  edgeWidth: 1.5,
  edgeWidthRange: [1, 6],
  edgeColor: themeColor('edge'),
  badgeFill: themeColor('badge-fill'),
  badgeInk: themeColor('badge-ink'),
  badgeRing: themeColor('node-ring'),
  groupFill: themeColor('group-fill'),
  groupStroke: themeColor('group-line'),
  groupStrokeWidth: 1,
  groupPadding: 16,
  shapeFill: themeColor('shape-fill'),
  shapeStroke: themeColor('shape-stroke'),
}

export const ringWidth = 2

export type BuiltInStyles = Readonly<Record<BuiltInState, StateStyle>>

export const builtInStyles: Readonly<Record<'nodes' | 'edges' | 'shapes', BuiltInStyles>> = {
  nodes: {
    selected: {
      stroke: themeColor('accent'),
      strokeWidth: ringWidth,
      halo: true,
      label: true,
      raise: true,
    },
    hovered: { stroke: themeColor('ink'), strokeWidth: ringWidth, label: true, raise: true },
    focused: { stroke: themeColor('focus-ring'), strokeWidth: ringWidth, label: true, raise: true },
  },
  edges: {
    selected: { stroke: themeColor('accent'), halo: true, raise: true },
    hovered: { stroke: themeColor('ink'), raise: true },
    focused: { stroke: themeColor('focus-ring'), raise: true },
  },
  shapes: {
    selected: { stroke: themeColor('accent'), strokeWidth: ringWidth, raise: true },
    hovered: { stroke: themeColor('ink'), raise: true },
    focused: {},
  },
}
