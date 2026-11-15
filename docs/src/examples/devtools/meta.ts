import type { ExampleMeta } from '../types'

export default {
  title: 'Devtools panel',
  description:
    'The panel of TanStack Devtools, inline under the graph: frame times, renderer timings, element counts, view, whether WebGL draws on a GPU or in software, the pixel ratio, and selection, updated as you interact.',
  hint: 'Pan and zoom to fill the frame chart. Change the node count to time a flush. Press One pixel per CSS pixel to set the pixel ratio to 1 with any renderer, and read the ratio and its reason in the View section.',
  category: 'tools',
  order: 30,
  tags: ['React', 'TanStack Devtools'],
  api: ['devtools', 'graph-component'],
  guides: ['devtools'],
} satisfies ExampleMeta
