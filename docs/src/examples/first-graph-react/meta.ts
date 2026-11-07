import type { ExampleMeta } from '../types'

export default {
  title: 'First graph in React',
  description:
    'The first graph as a React component: a definition built outside the component, the Graph component, and a child that reads the hovered element from the graph state.',
  hint: 'Hover a node or an edge: the line at the bottom follows.',
  category: 'basics',
  order: 30,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'define-graph'],
  guides: ['react', 'quick-start', 'typescript#react'],
} satisfies ExampleMeta
