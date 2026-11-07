const numbers = new Intl.NumberFormat('en-US')

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${numbers.format(nodes)} nodes and ${numbers.format(edges)} edges`,
  hint: 'Click the graph or press Tab, then use the arrow keys',
  focused: (label: string, group: string) => `${label}, group ${group}`,
  selected: (count: number) =>
    `${numbers.format(count)} ${count === 1 ? 'node' : 'nodes'} selected`,
  keys: [
    { keys: ['←', '↑', '→', '↓'], action: 'Move to the nearest node' },
    { keys: ['Enter'], action: 'Select it' },
    { keys: ['Shift', 'Enter'], action: 'Add it to the selection' },
    { keys: ['Esc'], action: 'Clear, then leave' },
    { keys: ['Shift', '←'], action: 'Pan the view' },
    { keys: ['+', '-', '0'], action: 'Zoom in, out, fit' },
  ],
} as const
