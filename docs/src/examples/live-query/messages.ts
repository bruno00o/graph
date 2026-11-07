const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: 'Graph of the nodes whose score passes a minimum, from a live query',
  minimum: (value: number) => `Minimum score: ${numbers.format(value)}`,
  rescore: 'Score a quarter of the nodes again',
  matching: (count: number, total: number, minimum: number) =>
    `${numbers.format(count)} of ${numbers.format(total)} nodes score ${numbers.format(minimum)} or more.`,
} as const
