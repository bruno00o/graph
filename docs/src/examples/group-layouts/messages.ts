export const messages = {
  graphLabel: (nodes: number, groups: number) =>
    `Graph of ${nodes} nodes in ${groups} groups, each group laid out with a layout of its own`,
  around: (name: string) => `Around the groups: ${name}`,
  arounds: {
    force: 'forces',
    grid: 'grid',
    none: 'nothing',
  },
  add: 'Add a node to a group',
  arrange: 'Arrange every group again',
  fold: 'Fold the groups',
  unfold: 'Unfold the groups',
} as const
