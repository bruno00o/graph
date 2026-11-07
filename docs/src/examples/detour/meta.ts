import type { ExampleMeta } from '../types'

export default {
  title: 'Detour around blocked nodes',
  description:
    'The cheapest path joins the two orange nodes. Click a node to block it: the search may no longer enter it, and the path goes around, until no way is left.',
  hint: 'Click nodes to block or open them.',
  category: 'analysis',
  order: 70,
  tags: ['Vanilla'],
  api: ['paths', 'events'],
  guides: ['paths#keep-to-some-nodes-and-edges', 'paths#highlight-a-path'],
  harness: { select: false },
} satisfies ExampleMeta
