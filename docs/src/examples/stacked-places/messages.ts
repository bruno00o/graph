export const messages = {
  graphLabel: (nodes: number, places: number) =>
    `Map of ${nodes} nodes at ${places} shared places, grouped by place`,
  node: (site: string, index: number) => `${site}${index}`,
  site: (count: number) => `${count} nodes`,
  spread: (on: boolean) => `Spread: ${on ? 'on' : 'off'}`,
  between: (mode: 'members' | 'groups') =>
    `Links: ${mode === 'groups' ? 'between places' : 'between nodes'}`,
  fill: (percent: number) => `Fill: ${percent}%`,
  hovered: (label: string, site: string) => `${label}, at place ${site}`,
} as const
