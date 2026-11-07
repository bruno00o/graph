export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes and ${edges} edges in six groups, on a circle`,
  layout: (name: string) => `Layout: ${name}`,
  layouts: { circle: 'circle by group', force: 'force' },
} as const
