import type { ExampleMeta } from '../types'

export default {
  title: 'PNG export options',
  description:
    'A live preview of exportPng as its options change: the region, a fixed scale in pixels per world unit or an exact size in pixels, the pixel ratio, the background, transparent included, the grid and the badges. The caption gives the size of the image.',
  hint: 'Change an option and watch the preview. With the view as region, pan or zoom.',
  category: 'tools',
  order: 60,
  tags: ['Vanilla'],
  api: ['export'],
  guides: [
    'export#region-and-scale',
    'export#exact-size',
    'export#pixel-ratio',
    'export#grid-and-badges',
    'export#background',
  ],
} satisfies ExampleMeta
