const axisNames = {
  auto: 'automatic',
  horizontal: 'left and right',
  vertical: 'top and bottom',
} as const

export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes on fixed positions, linked by ${edges} routed edges`,
  node: (index: number) => `N${index}`,
  axis: (axis: keyof typeof axisNames) => `Sides: ${axisNames[axis]}`,
  spacing: (value: number) => `Spacing: ${value} px`,
} as const
