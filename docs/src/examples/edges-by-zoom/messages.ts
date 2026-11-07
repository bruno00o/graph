const numbers = new Intl.NumberFormat('en-US')
const zoomFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges of varied strength`,
  shown: (zoom: number, shown: number, total: number) =>
    `Zoom ×${zoomFormat.format(zoom)}, ${numbers.format(shown)} of ${numbers.format(total)} edges shown`,
} as const
