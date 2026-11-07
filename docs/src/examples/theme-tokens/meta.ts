import type { ExampleMeta } from '../types'

export default {
  title: 'Theme tokens',
  description:
    'Two palettes written as --graph- CSS variables, each with a light and a dark variant, switched on the graph element without touching the definition.',
  hint: 'Switch the palette, then the docs theme: colors, the selection ring and the label font follow.',
  category: 'basics',
  order: 40,
  tags: ['Vanilla'],
  api: ['theme-tokens', 'mount-graph'],
  guides: ['theming', 'theming#override-a-token'],
} satisfies ExampleMeta
