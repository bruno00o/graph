import type { ExampleMeta } from '../types'

export default {
  title: 'Layers from React state',
  description:
    'Four layers between the same nodes, one of them with nodes of its own. React state owns the hidden layers through hiddenLayers and onLayerChange. Hiding the satellites hides their nodes and every edge that ends on them.',
  hint: 'Press a layer to hide or show it.',
  category: 'structure',
  order: 70,
  tags: ['React'],
  api: ['graph-component', 'edges', 'nodes'],
  guides: ['multilayer#show-and-hide-layers', 'multilayer#what-a-hidden-layer-is', 'react'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
