const arrowNames = {
  none: 'no arrow',
  target: 'arrow at target',
  source: 'arrow at source',
  both: 'arrows at both ends',
} as const

export const messages = {
  graphLabel: (count: number) => `Graph of ${count} edges, one for each arrow and dash`,
  sample: (dash: string, arrow: keyof typeof arrowNames) => `${dash}\n${arrowNames[arrow]}`,
  width: (value: number) => `Width: ${value} px`,
} as const
