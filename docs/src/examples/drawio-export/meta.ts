import type { ExampleMeta } from '../types'

export default {
  title: 'draw.io export',
  description:
    'Teams of people as unfolded groups, with boxes, circles, labels, dashed and curved edges, saved as an editable draw.io diagram: nodes become shapes, groups become containers and edges stay attached when a node moves in the editor.',
  hint: 'Select a person, then download the diagram and open it in draw.io.',
  category: 'tools',
  order: 65,
  tags: ['Vanilla'],
  api: ['export'],
  guides: ['export#drawio-diagrams'],
} satisfies ExampleMeta
