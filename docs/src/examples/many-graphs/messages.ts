export const messages = {
  graphLabel: (number: number) => `Small graph ${number} of 20`,
  title: (number: number) => `Graph ${number}`,
  active: (active: number, total: number) => `${active} of ${total} graphs drawing`,
} as const
