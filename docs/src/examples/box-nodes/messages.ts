export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Directed graph of ${nodes} box nodes and ${edges} edges in layers`,
  width: (name: string) => `Width: ${name}`,
  widths: { label: 'fit the label', fixed: 'fixed' },
  direction: (name: string) => `Direction: ${name}`,
  directions: { down: 'down', right: 'right' },
} as const
