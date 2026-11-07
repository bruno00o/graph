const numbers = new Intl.NumberFormat('en-US')
const kilobytes = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const messages = {
  graphLabel: 'Graph of 240 nodes with a preview of its PNG export',
  previewAlt: 'Preview of the exported image',
  download: 'Download the PNG',
  region: (name: string) => `Region: ${name}`,
  regions: { view: 'view', graph: 'whole graph' },
  scale: (zoom: number | null) =>
    zoom === null ? 'Scale: current zoom' : `Scale: ${numbers.format(zoom)} px per unit`,
  ratio: (value: number) => `Pixel ratio: ${numbers.format(value)}`,
  background: (name: string) => `Background: ${name}`,
  backgrounds: { theme: 'theme', transparent: 'transparent', white: 'white' },
  size: (width: number, height: number, bytes: number, time: number) =>
    `${numbers.format(width)} × ${numbers.format(height)} px, ${kilobytes.format(bytes / 1024)} KB, ${kilobytes.format(time)} ms`,
} as const
