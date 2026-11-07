const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: 'Graph explored from one node',
  reset: 'Start over',
  shown: (shown: number, total: number) =>
    `${numbers.format(shown)} of ${numbers.format(total)} nodes shown`,
} as const
