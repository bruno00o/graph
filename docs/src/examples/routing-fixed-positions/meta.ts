import type { ExampleMeta } from '../types'

export default {
  title: 'Routing on fixed positions',
  description:
    'Nodes placed by hand, without a layout, and edges routed around them. The axis chooses the sides edges leave and enter by, the spacing keeps side by side routes apart, and the dashed edges set route to false and stay straight.',
  hint: 'Drag a node: its routes follow, then go around the other nodes once it stops.',
  category: 'edges',
  order: 110,
  tags: ['Vanilla'],
  api: ['routing', 'edges'],
  guides: ['routing#which-edges-route'],
} satisfies ExampleMeta
