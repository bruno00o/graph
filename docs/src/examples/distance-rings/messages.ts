export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Radial layout of a network of ${nodes} nodes and ${edges} edges, with a ring for each distance from the root`,
  root: (label: string) => `Root: ${label}`,
  hops: (count: number) => `${count} ${count === 1 ? 'hop' : 'hops'}`,
} as const
