const zoomFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const messages = {
  graphLabel: (nodes: number, groups: number) =>
    `Graph of ${nodes} nodes in ${groups} groups, drawn as groups from afar`,
  group: (name: string) => `Group ${name}`,
  member: (group: string, index: number) => `${group}${index}`,
  members: (count: number) => `${count} nodes`,
  count: (value: number) => (value === 1 ? '1 edge' : `${value} edges`),
  zoom: (zoom: number, open: boolean) =>
    `Zoom ×${zoomFormat.format(zoom)}: ${open ? 'nodes' : 'groups'}`,
} as const
