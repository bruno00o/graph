const zooms = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const messages = {
  graphLabel:
    'Graph of eleven nodes in three columns, linked by edges of varied width, dashes and arrows',
  node: (column: number, row: number) => `Node ${String.fromCharCode(65 + column)}${row + 1}`,
  weight: (value: number) => String(value),
  width: (name: string) => `Width: ${name}`,
  widths: { linear: 'linear in the weight', sqrt: 'square root of the weight', uniform: 'uniform' },
  scale: (name: string) => `Zoomed out: ${name}`,
  scales: { screen: 'widths stay', shrink: 'widths shrink' },
  zoom: (value: number) => `Zoom ${zooms.format(value)}`,
} as const
