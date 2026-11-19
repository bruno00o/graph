const kilobytes = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

export const messages = {
  graphLabel: 'Three teams of people and who reviews whose work, to save as an editable diagram',
  drawio: 'Download .drawio',
  vsdx: 'Download .vsdx',
  states: (name: string) => `States: ${name}`,
  stateNames: { custom: 'own states', all: 'all, selection too', none: 'none' },
  region: (name: string) => `Region: ${name}`,
  regions: { graph: 'whole graph', view: 'view' },
  saved: (name: string, bytes: number) => `${name}, ${kilobytes.format(bytes / 1024)} KB`,
  reviews: 'reviews',
  pairs: 'pairs with',
} as const
