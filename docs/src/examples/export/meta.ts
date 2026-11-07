import type { ExampleMeta } from '../types'

export default {
  title: 'Export to PNG and SVG',
  description:
    'Download the graph as a PNG drawn offscreen at twice the pixel density, or as a standalone SVG document, for the current view or the whole graph.',
  hint: 'Pan or zoom, then download: the file shows what you see. Switch the region to frame every node.',
  category: 'tools',
  order: 20,
  tags: ['Vanilla'],
  api: ['export'],
  guides: ['export'],
} satisfies ExampleMeta
