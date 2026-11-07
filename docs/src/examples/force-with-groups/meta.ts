import type { ExampleMeta } from '../types'

export default {
  title: 'Forces with groups',
  description:
    'The force layout keeps nested groups whole: members pull toward the center of their group, edges between groups move whole groups, and a last pass leaves a gap around every container. Cohesion sets how hard members gather.',
  hint: 'Set cohesion to 0 and let go, then raise it. Widen the gap around groups.',
  category: 'layouts',
  order: 100,
  tags: ['Vanilla'],
  api: ['force', 'nodes'],
  guides: ['layout#groups', 'groups'],
} satisfies ExampleMeta
