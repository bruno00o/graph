function count(value: number, one: string, other: string): string {
  return `${value} ${value === 1 ? one : other}`
}

export const messages = {
  graphLabel: 'Graph whose nodes join, leave and change weight every second and a half',
  node: (index: number) => `Node ${index}`,
  weight: (value: number) => `weight ${value}`,
  play: 'Play',
  pause: 'Pause',
  ready: (nodes: number) => `${count(nodes, 'node', 'nodes')} shown`,
  round: (round: number, joined: number, left: number, changed: number, nodes: number) =>
    `Update ${round}: ${joined} joined, ${left} left, ${changed} changed weight, ${count(nodes, 'node', 'nodes')} shown`,
} as const
