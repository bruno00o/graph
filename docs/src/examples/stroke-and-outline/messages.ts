export const messages = {
  graphLabel:
    'Twelve nodes in three rows: a contour inside the shape, a ring outside it, and both together',
  row: { stroke: 'stroke', outline: 'outline', both: 'stroke and outline' },
  widths: (row: 'stroke' | 'outline' | 'both', width: number) =>
    row === 'stroke'
      ? `${width} px inside`
      : row === 'outline'
        ? `${width} px outside`
        : `3 px in, ${width} px out`,
} as const
