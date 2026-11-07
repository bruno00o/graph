export const messages = {
  graphLabel: (nodes: number, groups: number) =>
    `Graph of ${nodes} nodes in ${groups} groups nested three deep`,
  treeLabel: 'Groups',
  level: (level: number) => `Fold level ${level}`,
  openAll: 'Unfold all',
} as const
