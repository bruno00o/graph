import type { ExampleMeta } from '../types'

export default {
  title: 'Minimap and legend',
  description:
    '5,000 nodes with a minimap in a corner and a legend read from the color and size scales. The legend highlights a group under the pointer and fades it out on click.',
  hint: 'Drag the rectangle of the minimap to pan. Hover a group in the legend, click it to fade it out.',
  category: 'tools',
  order: 10,
  tags: ['Vanilla'],
  api: ['minimap', 'legend'],
  guides: ['minimap-and-legend'],
} satisfies ExampleMeta
