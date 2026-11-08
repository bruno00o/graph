export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Map of ${nodes} nodes linked by ${edges} routes that follow winding lines`,
  node: (index: number) => `Node ${index}`,
  routes: (winding: boolean) => `Routes: ${winding ? 'winding' : 'straight'}`,
  route: (from: string, to: string, points: number) =>
    `${from} to ${to}, ${points} ${points === 1 ? 'point' : 'points'}`,
} as const
