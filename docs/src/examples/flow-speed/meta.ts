import type { ExampleMeta } from '../types'

export default {
  title: 'Flow speed and direction',
  description:
    'Dashes move along each edge at the speed of its data, in screen pixels per second. A negative speed runs toward the source, and the width follows the speed.',
  hint: 'Press Reverse every flow, then change the speed or pause the flows.',
  category: 'edges',
  order: 60,
  tags: ['Vanilla'],
  api: ['edges'],
  guides: ['marks#flows'],
} satisfies ExampleMeta
