const steps = (count: number) => `${count} ${count === 1 ? 'step' : 'steps'}`

export const messages = {
  graphLabel: (count: number) =>
    `Graph of ${count} nodes: loops that start and end on two bases, with branches`,
  legend: {
    base: 'Base',
    two: 'Two ways out',
    one: 'One way out',
    dashed: 'Link with no second way',
  },
  summary: (two: number, one: number) =>
    `${two} nodes have two ways out, ${one} have only one. Click a node.`,
  base: (label: string) => `${label} is a base`,
  two: (
    label: string,
    first: { readonly base: string; readonly steps: number },
    second: { readonly base: string; readonly steps: number },
  ) =>
    `Node ${label}: two ways out that share no node, to ${first.base} in ${steps(first.steps)} and to ${second.base} in ${steps(second.steps)}`,
  one: (label: string, join: string) =>
    `Node ${label}: one way out, every path to a base goes through ${join}`,
  oneBase: (label: string, base: string) => `Node ${label}: one way out, to ${base} only`,
  none: (label: string) => `Node ${label}: no way to any base`,
} as const
