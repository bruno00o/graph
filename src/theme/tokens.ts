import type { Extent } from '../scales/extent'

export function themeColor(name: string): string {
  return `var(--graph-${name})`
}

export const categoricalRange: readonly string[] = Array.from({ length: 8 }, (_, index) =>
  themeColor(`cat-${index + 1}`),
)

export const sequentialRange: readonly string[] = [themeColor('cat-5'), themeColor('cat-1')]

export interface Defaults {
  readonly nodeSize: number
  readonly nodeSizeRange: Extent
  readonly nodeFill: string
  readonly nodeStroke: string
  readonly nodeStrokeWidth: number
  readonly edgeWidth: number
  readonly edgeWidthRange: Extent
  readonly edgeColor: string
}

export const defaults: Defaults = {
  nodeSize: 16,
  nodeSizeRange: [8, 32],
  nodeFill: themeColor('node'),
  nodeStroke: themeColor('node-ring'),
  nodeStrokeWidth: 1,
  edgeWidth: 1.5,
  edgeWidthRange: [1, 6],
  edgeColor: themeColor('edge'),
}
