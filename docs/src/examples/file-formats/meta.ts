import type { ExampleMeta } from '../types'

export default {
  title: 'File formats',
  description:
    'Read a graph from a GraphML, GEXF, JSON Graph Format or CSV file and save it in any of the others. Each sample is a small file: the GEXF one carries colors, sizes and positions, the GraphML one nested graphs, which become groups.',
  hint: 'Drop a file on the graph or open one, try the samples, then save the graph in another format.',
  category: 'data',
  order: 130,
  tags: ['Vanilla'],
  api: ['formats'],
  guides: ['file-formats'],
} satisfies ExampleMeta
