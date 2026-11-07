export const messages = {
  graphLabel: 'Graph of nine nodes in three groups, linked by ten edges',
  node: (index: number) => `Node ${index}`,
  nothingHovered: 'Hover a node or an edge',
  hoveredNode: (label: string, group: string, weight: number) =>
    `${label}, group ${group}, weight ${weight}`,
  hoveredEdge: (from = '', to = '') => `Edge from ${from} to ${to}`,
} as const
