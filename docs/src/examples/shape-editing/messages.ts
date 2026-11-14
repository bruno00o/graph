export const messages = {
  graphLabel: (shapes: number, nodes: number) =>
    `Graph of ${nodes} nodes over ${shapes} shapes that the pointer draws, moves and reshapes`,
  toolsLabel: 'Tools',
  tools: {
    select: 'Select',
    rectangle: 'Rectangle',
    circle: 'Circle',
    line: 'Line',
    polygon: 'Polygon',
    freehand: 'Freehand',
    text: 'Text',
  },
  note: 'Double click a note to change its text, or draw a new one with the Text tool',
  placeholder: 'Type a note',
  textLabel: 'Text of the note',
  undo: 'Undo',
  redo: 'Redo',
  duplicate: 'Duplicate',
  raise: 'Bring to front',
  lower: 'Send to back',
  remove: 'Remove',
  snap: 'Snap to the grid',
  status: (shapes: number) => (shapes === 1 ? '1 shape' : `${shapes} shapes`),
  drawing: (points: number, polygon: boolean) =>
    `${points === 1 ? '1 point' : `${points} points`}: Enter or a double click ends the ${
      polygon ? 'polygon' : 'line'
    }, Escape cancels it`,
} as const
