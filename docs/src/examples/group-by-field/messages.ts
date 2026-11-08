export const messages = {
  graphLabel: (nodes: number) => `Graph of ${nodes} nodes grouped by a field`,
  field: (name: string) => `Group by: ${name}`,
  fields: { group: 'group', band: 'weight band', none: 'nothing' },
  group: (value: string, count: number) => `Group ${value}, ${count} nodes`,
  band: (value: string, count: number) =>
    `${value[0]?.toUpperCase()}${value.slice(1)}, ${count} nodes`,
  between: (mode: 'members' | 'groups') =>
    `Between groups: ${mode === 'groups' ? 'one line' : 'nodes'}`,
  fill: (percent: number) => `Group fill: ${percent}%`,
} as const
