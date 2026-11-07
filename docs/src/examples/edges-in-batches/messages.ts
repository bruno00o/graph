const numbers = new Intl.NumberFormat('en-US')
const milliseconds = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const messages = {
  graphLabel: (nodes: number) =>
    `Graph of ${numbers.format(nodes)} nodes that receives edges in batches`,
  append: (count: number) => `Add ${numbers.format(count)} edges`,
  reset: 'Reset',
  added: (count: number, time: number) =>
    `${numbers.format(count)} edges added and drawn in ${milliseconds.format(time)} ms.`,
  total: (count: number) => `${numbers.format(count)} edges in all.`,
} as const
