export const messages = {
  graphLabel: (shapes: number, nodes: number) =>
    `Graph of ${nodes} nodes over ${shapes} shapes shared with the other tabs of this page`,
  live: 'Send while dragging',
  simulate: 'Simulate other editors',
  reset: 'Reset shapes',
  others: (count: number) =>
    count === 0 ? 'No one else here' : count === 1 ? '1 other here' : `${count} others here`,
} as const
