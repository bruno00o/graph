export const messages = {
  graphLabel: (nodes: number, groups: number) => `Graph of ${nodes} nodes in ${groups} groups`,
  mode: (relayout: boolean) =>
    relayout ? 'After a fold: lay out again' : 'After a fold: make room only',
  foldAll: 'Fold all',
  unfoldAll: 'Unfold all',
} as const
