export const messages = {
  graphLabel: (nodes: number, places: number) =>
    `Map of ${nodes} nodes at ${places} shared places, grouped by place`,
  node: (site: string, index: number) => `${site}${index}`,
  site: (count: number) => `${count} nodes`,
  spread: (on: boolean) => `Spread: ${on ? 'on' : 'off'}`,
  hovered: (label: string, site: string) => `${label}, at place ${site}`,
} as const
