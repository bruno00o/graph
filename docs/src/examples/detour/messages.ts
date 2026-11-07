const numbers = new Intl.NumberFormat('en-US')

const blockedNodes = (count: number) =>
  `${numbers.format(count)} ${count === 1 ? 'node' : 'nodes'} blocked`

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Mesh of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} weighted edges`,
  found: (cost: number, blocked: number) =>
    `Path cost ${numbers.format(cost)}, ${blockedNodes(blocked)}`,
  cutOff: (blocked: number) => `No path left, ${blockedNodes(blocked)}`,
} as const
