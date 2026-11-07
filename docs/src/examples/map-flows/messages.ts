export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Map of ${nodes} nodes around five hubs, with ${edges} flowing edges`,
  hub: (name: string) => `Hub ${name}`,
  node: (index: number) => `Node ${index}`,
  stop: 'Stop flows',
  start: 'Start flows',
} as const
