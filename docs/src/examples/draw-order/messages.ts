export const messages = {
  graphLabel: (nodes: number, stacks: number) =>
    `Graph of ${nodes} nodes stacked on ${stacks} places`,
  order: (bigFirst: boolean) => (bigFirst ? 'Order: big under small' : 'Order: small under big'),
  empty: 'Click a stack: the node on top is the one picked',
  picked: (count: number, stacked: number) =>
    `Picked the node of count ${count}, on top of a stack of ${stacked}`,
} as const
