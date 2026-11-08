import type { ShowcaseMeta } from '../types'

export default {
  title: 'Air routes',
  description:
    'Scheduled airline routes between airports, as a graph and on a map. Search an airport, filter by country and airline, merge the routes of an airport pair and open them into their airlines, and group the airports of one area.',
  domain: 'Transport',
  order: 10,
  tags: ['React', 'MapLibre', 'Groups', 'Merged edges', 'Geo layout'],
  features: [
    {
      text: 'Routes between the same two airports merge into one edge as wide as the number of airlines; a double-click opens it into its airlines.',
      page: 'transformations#merge-parallel-edges',
    },
    {
      text: 'The graph and the map share one data set and one camera: the geo layout places airports like the map does.',
      page: 'map#with-and-without-a-map',
    },
    {
      text: 'Airports within 35 km of each other fold into one group node with a count badge, on the map as in the graph.',
      page: 'transformations#group-items-by-a-field',
    },
    {
      text: 'Hovering a group pins a second graph to it: its airports and their busiest destinations.',
      page: 'react',
    },
    {
      text: 'Filters and a double-click on an airport change the data the graph is given; positions and selection stay.',
      page: 'data',
    },
  ],
  api: ['define-graph', 'groups', 'map-graph', 'layouts', 'anchor'],
  source: {
    name: 'OpenFlights',
    url: 'https://openflights.org/data.php',
    license: 'Open Database License (ODbL) v1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    build: 'pnpm docs:showcase-data',
  },
} satisfies ShowcaseMeta
