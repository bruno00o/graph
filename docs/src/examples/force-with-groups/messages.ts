export const messages = {
  graphLabel: (nodes: number) => `Graph of ${nodes} nodes in six groups, two of them nested`,
  settings: {
    cohesion: (value: number) => `Cohesion: ${value.toFixed(2)}`,
    groupSpacing: (value: number) => `Gap around groups: ${value}`,
    edgeLength: (value: number) => `Edge length: ${value}`,
  },
} as const
