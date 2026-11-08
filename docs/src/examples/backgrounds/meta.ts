import type { ExampleMeta } from '../types'

export default {
  title: 'Backgrounds',
  description:
    'Every option of the background grid: lines or dots, adaptive levels that blend as you zoom or a single fixed level, the spacing, the two colors, and none at all. The canvas is transparent, so a gradient, stripes or checks of the page show through.',
  hint: 'Zoom in and out to watch the three levels blend, switch to fixed to see one level scale with the zoom, and try the page behind.',
  category: 'style',
  order: 120,
  tags: ['Vanilla'],
  api: ['define-graph'],
  guides: ['drawing-layers#background-grid'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
