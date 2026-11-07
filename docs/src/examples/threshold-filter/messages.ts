export const messages = {
  graphLabel: (nodes: number, edges: number) => `Graph of ${nodes} nodes and ${edges} edges`,
  threshold: (value: number) => `Smallest weight shown: ${value}`,
  shown: (count: number, total: number) => `${count} of ${total} nodes shown`,
  selected: (count: number, hidden: number) =>
    count === 0
      ? 'Shift and click nodes to select them.'
      : `${count} selected, ${hidden} of them hidden`,
} as const
