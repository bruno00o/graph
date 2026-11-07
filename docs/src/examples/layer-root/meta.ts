import type { ExampleMeta } from '../types'

export default {
  title: 'Layers from a root, with cycles',
  description:
    'A directed graph with a few edges that close cycles, dashed here. The layered layout turns as few edges around as it can to break the cycles, and still draws them pointing back. A root goes on the first layer even when edges lead into it.',
  hint: 'Click a node to make it the root, and click it again to clear it.',
  category: 'layouts',
  order: 70,
  tags: ['Vanilla'],
  api: ['layouts', 'edges'],
  guides: ['layout#layers', 'states'],
  harness: { select: false },
} satisfies ExampleMeta
