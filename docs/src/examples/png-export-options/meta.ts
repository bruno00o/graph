import type { ExampleMeta } from '../types'

export default {
  title: 'PNG export options',
  description:
    'A live preview of exportPng as its options change: the region, a fixed scale in pixels per world unit, the pixel ratio and the background, transparent included. The caption gives the size of the image.',
  hint: 'Change an option and watch the preview. With the view as region, pan or zoom.',
  category: 'tools',
  order: 60,
  tags: ['Vanilla'],
  api: ['export'],
  guides: ['export'],
} satisfies ExampleMeta
