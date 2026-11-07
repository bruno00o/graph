export interface Category {
  readonly id: string
  readonly title: string
  readonly description: string
}

export const categories = [
  {
    id: 'basics',
    title: 'Basics',
    description: 'A first graph from plain arrays, and the ways to move around it.',
  },
  {
    id: 'style',
    title: 'Style',
    description: 'Colors, sizes, shapes, labels, images, badges and what is drawn around nodes.',
  },
  {
    id: 'layouts',
    title: 'Layouts',
    description: 'Place nodes with forces, in layers, on a grid, in rings or as a radial tree.',
  },
  {
    id: 'structure',
    title: 'Groups and structure',
    description: 'Nested groups that fold, merged edges, layers of edges and what carries what.',
  },
  {
    id: 'interaction',
    title: 'Interaction',
    description:
      'Selection, hover, focus, the keyboard, a lens and overlays that follow the graph.',
  },
  {
    id: 'analysis',
    title: 'Analysis',
    description: 'Paths, neighborhoods and reachability, shown with states.',
  },
  {
    id: 'edges',
    title: 'Edges',
    description: 'Parallel edges, loops, arrows, edge ends, bundling and routing.',
  },
  {
    id: 'time-and-maps',
    title: 'Time, zoom and maps',
    description: 'What the graph shows by time window or zoom level, and graphs drawn on a map.',
  },
  {
    id: 'data',
    title: 'Data and scale',
    description:
      'TanStack DB collections, data loaded on demand with TanStack Query, filters and large graphs.',
  },
  {
    id: 'tools',
    title: 'Tools and exports',
    description: 'Minimap, legend, TanStack Devtools, and downloads as PNG or SVG.',
  },
] as const satisfies readonly Category[]

export type CategoryId = (typeof categories)[number]['id']
