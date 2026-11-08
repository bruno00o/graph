export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Graph of ${nodes} nodes linked by ${edges} edges drawn through waypoints`,
  node: (name: string) => `Node ${name}`,
  waypoints: (shown: boolean) => `Waypoints: ${shown ? 'on' : 'off'}`,
  edge: (from: string, to: string, points: number) =>
    `${from} to ${to}, ${points} ${points === 1 ? 'waypoint' : 'waypoints'}`,
  detour: 'detour',
} as const
