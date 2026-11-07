const numbers = new Intl.NumberFormat('en-US')
const list = new Intl.ListFormat('en-US', { type: 'conjunction' })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  hint: 'Click a node',
  hops: (value: number) => `Up to ${numbers.format(value)} ${value === 1 ? 'hop' : 'hops'}`,
  reached: (rings: readonly number[]) =>
    list.format(
      rings.map(
        (count, index) =>
          `${numbers.format(count)} at ${index + 1} ${index === 0 ? 'hop' : 'hops'}`,
      ),
    ),
} as const
