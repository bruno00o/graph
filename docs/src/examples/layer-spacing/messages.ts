export const messages = {
  graphLabel: (nodes: number, edges: number) =>
    `Directed graph of ${nodes} nodes and ${edges} edges in layers`,
  direction: (name: string) => `Direction: ${name}`,
  directions: { right: 'right', down: 'down', left: 'left', up: 'up' },
  layerSpacing: (value: number) => `Gap between layers: ${value}`,
  nodeSpacing: (value: number) => `Gap between nodes: ${value}`,
} as const
