export const messages = {
  graphLabel: 'Graph of forty-eight nodes placed by the x and y fields of their data',
  arrangement: (name: string) => `Arrangement: ${name}`,
  arrangements: { clusters: 'clusters', circle: 'circle', grid: 'grid', rows: 'rows by weight' },
  shift: 'Move group A right',
  unshift: 'Move group A back',
  hint: 'Drag a node: it stays there until its own x or y changes.',
} as const
