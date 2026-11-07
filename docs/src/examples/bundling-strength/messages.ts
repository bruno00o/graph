const numbers = new Intl.NumberFormat('en-US')
const share = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 })

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes in ten groups and ${numbers.format(edges)} bundled edges between them`,
  strength: (value: number) => `Strength ${share.format(value)}`,
  bundling: 'Bundling…',
  bundled: (runs: number, duration: number) =>
    `${runs === 1 ? 'Bundled once' : `Bundled ${numbers.format(runs)} times`}, last in ${numbers.format(Math.round(duration))} ms`,
} as const
