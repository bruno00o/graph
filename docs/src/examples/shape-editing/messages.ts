export const messages = {
  graphLabel: (shapes: number, nodes: number) =>
    `Graph of ${nodes} nodes over ${shapes} shapes that the pointer moves and reshapes`,
  undo: 'Undo',
  remove: 'Remove the selection',
  status: (edits: number) => (edits === 1 ? '1 edit' : `${edits} edits`),
} as const
