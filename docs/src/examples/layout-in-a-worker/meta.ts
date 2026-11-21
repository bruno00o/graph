import type { ExampleMeta } from '../types'

export default {
  title: 'Layout in a Web Worker',
  description:
    'A Web Worker builds the graph with createGraph from the headless entry point, waits for settled(), and sends back the positions and an SVG export. The page mounts the graph with initialPositions, so it appears already laid out, and shows the SVG beside it.',
  hint: 'Pick another graph: the worker lays it out while the page stays free.',
  category: 'tools',
  order: 120,
  tags: ['React'],
  api: ['create-graph', 'graph-core', 'mount-graph', 'export'],
  guides: ['server-side-extracts', 'positions#restore-at-mount'],
} satisfies ExampleMeta
