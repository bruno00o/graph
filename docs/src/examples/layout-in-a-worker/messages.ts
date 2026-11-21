export const messages = {
  graphLabel: 'Graph of six hundred nodes, drawn where a layout in a Web Worker placed them',
  previewLabel: 'SVG export of the same graph, written in the Web Worker',
  mounted: 'Mounted with initialPositions',
  exported: 'SVG written by the worker',
  another: 'Another graph',
  working: 'Laying out in a worker',
  done: (duration: number) => `Laid out in the worker in ${duration} ms. The page ran no layout.`,
} as const
