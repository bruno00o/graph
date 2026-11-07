export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Directed graph of ${nodes} nodes and ${edges} edges, some of them in cycles`,
  noRoot: 'Click a node to put it on the first layer',
  root: (label: string) => `First layer: ${label}. Click it again to clear.`,
} as const
