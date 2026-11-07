const numbers = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const zooms = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges whose view lives in React state`,
  zoom: (value: number) => `Zoom ${zooms.format(value)}`,
  lock: 'Lock the vertical position',
  unlock: 'Unlock the vertical position',
  center: (x: number, y: number) => `Center ${numbers.format(x)}, ${numbers.format(y)}`,
} as const
