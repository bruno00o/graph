export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes in five groups and ${edges} edges`,
  columns: 'Columns by group',
  trees: 'A tree per group',
  force: 'Forces on the nodes shown',
  hide: (hidden: boolean) => (hidden ? 'Show light nodes' : 'Hide light nodes'),
  computing: 'Computing the trees',
  running: (name: string) => `Running: ${name}`,
  ended: (name: string, completed: boolean) => (completed ? `Done: ${name}` : `Stopped: ${name}`),
} as const
