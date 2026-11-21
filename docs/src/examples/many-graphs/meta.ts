import type { ExampleMeta } from '../types'

export default {
  title: 'Many graphs on a page',
  description:
    'Twenty small graphs, more than the 16 WebGL contexts a browser keeps per page. Each card suspends its graph while it is out of sight and resumes it when it comes into view, so the graphs on screen always have a context.',
  hint: 'Scroll the grid: the counter follows the graphs in sight.',
  category: 'tools',
  order: 110,
  tags: ['React'],
  api: ['graph-component', 'graph-instance'],
  guides: ['react#many-graphs-on-a-page', 'browser-support#many-graphs-on-a-page'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
