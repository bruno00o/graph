import type { ShowcaseMeta } from '../types'

export default {
  title: 'Citation network',
  description:
    'Works of graph theory as they publish and cite each other. Search a title or an author, follow what a work cites and what cites it over one or two steps up or down, trace the shortest citation path between two works, and play the field year by year on the timeline.',
  domain: 'Research',
  order: 30,
  tags: ['React', 'Force layout', 'Scales', 'Paths', 'Timeline', 'Minimap'],
  features: [
    {
      text: 'The whole data set lays out with forces, computed on the GPU by the automatic engine at this size.',
      page: 'layout#engines',
    },
    {
      text: 'Nodes size by the citations they receive in the data set, on a square-root scale, and color by publication year, on a sequential scale the legend renders as a ramp.',
      page: 'scales#color',
    },
    {
      text: 'Search selects and frames a work, and reach queries forward and backward, at a chosen depth, light its neighborhood while a state with others dims the rest and arrows show the way of each citation.',
      page: 'paths#within-reach',
    },
    {
      text: 'The shortest citation path between two works comes from a bidirectional query, drawn raised with flowing dashes and listed in the panel.',
      page: 'paths#highlight-a-path',
    },
    {
      text: 'Every work sits at its publication year, and the timeline watches the field grow; works with no year stay visible.',
      page: 'time#timeline',
    },
    {
      text: 'A minimap of the whole graph helps find the way around the density.',
      page: 'minimap-and-legend#minimap',
    },
  ],
  api: ['define-graph', 'nodes', 'edges', 'force', 'paths', 'timeline', 'minimap', 'legend'],
  source: {
    name: 'OpenAlex',
    url: 'https://openalex.org',
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    build: 'pnpm docs:showcase-data citation-network --raw <folder>',
    note: 'OpenAlex is a living database, so these files are a dated snapshot taken by the build script: the works of one topic, the citations between them, and their years as the database held them on the day of retrieval. Counts and titles are what OpenAlex reported; a work with no year stays outside the timeline window. Run the build with --fetch and a folder name to take a fresh snapshot.',
  },
} satisfies ShowcaseMeta
