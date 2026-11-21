import { defineGraph, edges, type Layout, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'

export function definitionOf(seed: number, layout?: Layout) {
  const { items, links } = createSample(600, 900, 5, seed, 0.05)
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
      nodes<Item>(items, { color: 'group', size: 'weight', units: 'screen' }),
    ],
    scales: { size: { range: [5, 12] } },
    layout,
  })
}
