import type { Layout } from '@bruno00o/graph'

export function circleByGroup<T>(groupOf: (item: T) => string, spacing = 12, gap = 3): Layout<T> {
  return {
    name: 'circle-by-group',
    options: { groupOf, spacing, gap },
    incremental: false,
    start(graph, listener) {
      const xy = graph.xy.slice()
      const free: { index: number; group: string }[] = []
      let x = 0
      let y = 0
      let widest = 0
      for (let index = 0; index < graph.capacity; index++) {
        const item = graph.datum(index)
        if (graph.movable[index] !== 1 || item === undefined) continue
        free.push({ index, group: groupOf(item) })
        x += xy[index * 2] ?? 0
        y += xy[index * 2 + 1] ?? 0
        widest = Math.max(widest, (graph.radius[index] ?? 0) * 2)
      }
      free.sort((a, b) => a.group.localeCompare(b.group) || a.index - b.index)
      const breaks = free.filter((node, at) => at > 0 && node.group !== free[at - 1]?.group).length
      const slots = free.length + (breaks > 0 ? breaks + 1 : 0) * gap
      const step = widest + spacing
      const radius = Math.max(step, (slots * step) / (Math.PI * 2))
      x /= Math.max(1, free.length)
      y /= Math.max(1, free.length)
      let slot = 0
      free.forEach((node, at) => {
        if (at > 0 && node.group !== free[at - 1]?.group) slot += gap
        const angle = (slot / slots) * Math.PI * 2 - Math.PI / 2
        xy[node.index * 2] = x + Math.cos(angle) * radius
        xy[node.index * 2 + 1] = y + Math.sin(angle) * radius
        slot++
      })
      listener.end(xy)
      return { pin: () => {}, stop: () => {} }
    },
  }
}
