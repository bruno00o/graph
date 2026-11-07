export const messages = {
  graphLabel: 'Tree of twenty-one nodes: a diamond at the root, squares, then circles',
  node: (index: number) => `Node ${index}`,
  branch: (index: number) => `Branch ${index}`,
  shape: (name: string) => `Shape: ${name}`,
  choices: { level: 'by level', circle: 'circle', square: 'square', diamond: 'diamond' },
} as const
