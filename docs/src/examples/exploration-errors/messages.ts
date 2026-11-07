const numbers = new Intl.NumberFormat('en-US')

function count(value: number, one: string, other: string): string {
  return `${numbers.format(value)} ${value === 1 ? one : other}`
}

export const messages = {
  graphLabel: 'Graph explored step by step from a server that sometimes fails',
  retryAll: 'Retry failed nodes',
  reset: 'Fold everything',
  explored: (value: number) => `${count(value, 'node', 'nodes')} unfolded`,
  loading: (value: number) => `Loading ${count(value, 'neighborhood', 'neighborhoods')}`,
  failed: (value: number) =>
    `${count(value, 'neighborhood', 'neighborhoods')} failed to load: double-click to retry`,
  hoveredFailure: (label: string) => `${label} failed to load: double-click to retry`,
} as const
