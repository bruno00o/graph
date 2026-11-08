import type { ShowcaseMeta } from '../types'

export default {
  title: 'Programming language influences',
  description:
    'Which programming languages shaped which, from the 1940s to today. Search a language and follow what influenced it and what it influenced, play the history year by year, lay it out in layers, and fold the picture to its main paradigms.',
  domain: 'Computing',
  order: 20,
  tags: ['React', 'Box nodes', 'Layers layout', 'Groups', 'Timeline', 'Paths'],
  features: [
    {
      text: 'Each language is a box as wide as its name, colored by its main paradigm, with text that stays readable on every color.',
      page: 'marks#boxes',
    },
    {
      text: 'The layered layout lays influences out from older to newer languages, with reciprocal influences turned around.',
      page: 'layout#layers',
    },
    {
      text: 'The lineage of a language comes from reach queries backward and forward, at a chosen depth, and a state fades the rest.',
      page: 'paths#within-reach',
    },
    {
      text: 'The timeline plays the creation years in grow mode; languages with no year stay visible.',
      page: 'time#timeline',
    },
    {
      text: 'Languages group by main paradigm into nodes that fold and unfold, with merged edges counting the influences between paradigms.',
      page: 'transformations#group-items-by-a-field',
    },
    {
      text: 'The legend switches paradigms off and on, and fades the others while you point at one.',
      page: 'minimap-and-legend#legend',
    },
  ],
  api: ['define-graph', 'nodes', 'groups', 'layouts', 'paths', 'timeline', 'legend'],
  source: {
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    build: 'pnpm docs:showcase-data language-influences --raw <response.json>',
    note: 'Wikidata is a database that keeps changing, so these files are a dated snapshot: the response of the query saved with the build script, retrieved on 8 November 2026 at 11:56 UTC. Years, paradigms and influences are what its contributors entered; a language with no English label shows its identifier, and a language with no year stays outside the timeline window. Run the build with --fetch and a file name to take a fresh snapshot.',
  },
} satisfies ShowcaseMeta
