const numbers = new Intl.NumberFormat('en-US')

const plural = (count: number, one: string, many: string) =>
  `${numbers.format(count)} ${count === 1 ? one : many}`

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  search: 'Search the nodes',
  placeholder: 'Type a name',
  results: 'Matching nodes',
  none: 'No node matches',
  matches: (count: number, shown: number) =>
    count > shown
      ? `First ${numbers.format(shown)} of ${plural(count, 'match', 'matches')}`
      : plural(count, 'match', 'matches'),
  chosen: (label: string, neighbors: number) =>
    `${label} and ${plural(neighbors, 'neighbor', 'neighbors')}`,
} as const
