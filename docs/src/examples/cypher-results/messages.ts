export const messages = {
  graphLabel: 'Graph explored from query results, one neighborhood at a time',
  loading: 'Running the query…',
  explored: (expanded: number) => `${expanded} ${expanded === 1 ? 'node' : 'nodes'} expanded`,
} as const
