export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes of four kinds and ${edges} edges, one layer per kind`,
  order: (kinds: string) => `Order: ${kinds}`,
  source: (fromKinds: boolean) => (fromKinds ? 'Layers: by kind' : 'Layers: from edges'),
  noKind: 'no kind',
} as const
