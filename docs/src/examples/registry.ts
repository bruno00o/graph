import type { GraphInstance } from '@bruno00o/graph'
import type { ComponentType, Ref } from 'react'

export type ExampleTag =
  | 'Vanilla'
  | 'React'
  | 'TanStack DB'
  | 'TanStack Query'
  | 'TanStack Devtools'

export type LoadedExample =
  | { readonly kind: 'vanilla'; readonly mount: (container: HTMLElement) => GraphInstance }
  | {
      readonly kind: 'react'
      readonly Example: ComponentType<{ readonly ref: Ref<GraphInstance | null> }>
    }

export interface ExampleEntry {
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly hint: string
  readonly tags: readonly ExampleTag[]
  readonly modules: readonly string[]
  readonly files: readonly string[]
  readonly load: () => Promise<LoadedExample>
}

const shared = ['shared/data.ts', 'shared/messages.ts', 'shared/overlays.css']

export const examples: readonly ExampleEntry[] = [
  {
    slug: 'selection',
    title: 'Selection and lasso',
    description:
      'A thousand nodes from two arrays. Select a node to fade everything outside its neighborhood, or draw a lasso around several.',
    hint: 'Shift and drag to draw a lasso. Arrows move the focus, Enter selects.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['selection/main.ts', ...shared],
    load: () => import('./selection/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'large-graph',
    title: 'Large graph',
    description:
      '50,000 nodes and 100,000 edges drawn with WebGL2. Pan, zoom, hover and drag any node.',
    hint: 'Scroll to zoom, drag the background to pan.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['large/main.ts', 'shared/data.ts', 'shared/messages.ts'],
    load: () => import('./large/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'navigation',
    title: 'Navigation',
    description:
      'A graph inside a page that scrolls: the wheel scrolls the page, Cmd or Ctrl and the wheel zooms, and the view cannot leave the nodes. Switch the wheel mode and the bounds.',
    hint: 'Scroll over the graph, then hold Cmd or Ctrl to zoom. Pinch to zoom. Drag a node to the edge.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['navigation/main.ts', ...shared],
    load: () => import('./navigation/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'force-layout',
    title: 'Force layout',
    description:
      'Nodes without coordinates settle into communities with a force simulation, on the GPU from 2,000 nodes and on the CPU below, in a Web Worker.',
    hint: 'Drag a node while it runs to pin it. Add nodes: only the new ones move.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/layouts/force'],
    files: ['layout/main.ts', 'shared/data.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./layout/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'edge-bundling',
    title: 'Edge bundling',
    description:
      'Edges between communities of a force layout merge into bundles once nodes stand still, computed by density in a Web Worker. Change the strength and the reach, or turn bundling off: edges glide between shapes.',
    hint: 'Drag a node: edges bundle again once it stops.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/bundling', '@bruno00o/graph/layouts/force'],
    files: ['bundling/main.ts', 'shared/data.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./bundling/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'zoom-detail',
    title: 'Zoom and level of detail',
    description:
      'Three tiers of nodes on fixed positions. Branches and leaves fade in as the view zooms in, and the dashed links between hubs fade out. Hidden elements are neither picked, labeled nor exported.',
    hint: 'Scroll to zoom in on a hub.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['zoom/main.ts', 'shared/data.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./zoom/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'time',
    title: 'Time',
    description:
      'Three hundred nodes and five hundred edges that appear and disappear over four years. A timeline counts them over time; brush a window or play it, and the graph shows only what exists in it.',
    hint: 'Press play, or drag across the histogram to choose a window.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/layouts/force', '@bruno00o/graph/timeline'],
    files: ['time/main.ts', ...shared],
    load: () => import('./time/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'lens',
    title: 'Lens',
    description:
      'Twenty thousand nodes on fixed positions. A magnifying lens draws the area under it four times larger, with its own labels, and clicks inside it hit what it shows.',
    hint: 'Hold Alt over the graph, or show a fixed lens and drag it.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['lens/main.ts', ...shared],
    load: () => import('./lens/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'multilayer',
    title: 'Multilayer graph',
    description:
      'Three layers of edges between the same places: segments, paths that run along segments, and routes that run along paths. Hide a layer from the legend, and click an edge to light what carries it and what it carries.',
    hint: 'Click an edge. Click a layer in the legend to hide it.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/legend'],
    files: ['multilayer/main.ts', ...shared],
    load: () => import('./multilayer/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'layouts',
    title: 'Layouts',
    description:
      'A directed graph laid out in layers, in any direction, then with forces, on a grid sorted by group, in rings by degree and as a radial tree. Nest its branches in groups: the layers keep flowing across them. Nodes glide to their new place and the view frames the result.',
    hint: 'Switch the layout, the direction or the groups. Shift and drag around some nodes, then arrange only them.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/layouts', '@bruno00o/graph/layouts/force'],
    files: ['layouts/main.ts', 'shared/data.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./layouts/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'react-overlays',
    title: 'React overlays',
    description:
      'A tooltip that follows the hovered node and a panel that lists the selection, both rendered as children of the graph.',
    hint: 'Hover a node, click to select, hold Shift to add more.',
    tags: ['React'],
    modules: ['@bruno00o/graph/react'],
    files: ['overlays/main.tsx', ...shared],
    load: () => import('./overlays/main').then(({ Example }) => ({ kind: 'react', Example })),
  },
  {
    slug: 'images-and-badges',
    title: 'Images, badges and outlines',
    description:
      'Pictures clipped to the node shape, icons tinted with a theme color, badges in the corners, colored outlines and label backgrounds.',
    hint: 'Switch the theme: tinted icons, badges and outlines follow it.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['images/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./images/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'labels',
    title: 'Label styles',
    description:
      'Labels with their own size, color, weight and placement, a second line, line breaks, truncation, and labels along the edges.',
    hint: 'Change the placement, then zoom out: small nodes drop their labels first.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['labels/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./labels/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'drawing-layers',
    title: 'Grid, hulls and anchors',
    description:
      'A background grid that adapts to the zoom, hulls around each group or around the selection, and HTML pinned to nodes and edges: a toolbar over the selection, a tooltip, group names.',
    hint: 'Click a node for its toolbar, Shift to add more. Drag a node: its hull follows.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/layouts/force'],
    files: [
      'drawing/main.ts',
      'drawing/drawing.css',
      'shared/data.ts',
      'shared/messages.ts',
      'shared/overlays.css',
    ],
    load: () => import('./drawing/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'shortest-path',
    title: 'Shortest path',
    description:
      'Select two nodes: the shortest path between them flows from one to the other, and the rest fades. Count the edges, or weigh each one by its drawn length.',
    hint: 'Click a node, then Shift and click another. Switch the weight to compare.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['paths/main.ts', ...shared],
    load: () => import('./paths/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'parallel-edges',
    title: 'Parallel edges and loops',
    description:
      'Several edges between the same two nodes bend apart, loops nest around their node, with arrows, dashes, flows and labels per edge.',
    hint: 'Drag a node: the curves and their labels follow. Hover an edge to read its direction.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['edges/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./edges/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'nested-groups',
    title: 'Nested groups',
    description:
      'Nodes in nested groups, laid out by forces or in layers, with every container kept whole. Fold a group into a single node: the edges that cross it merge into one edge per pair, styled by their count.',
    hint: 'Double-click a group to fold or unfold it. Drag a group by its border to move everything inside. Switch to layers to see the edges flow across the groups.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/layouts', '@bruno00o/graph/layouts/force'],
    files: ['groups/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./groups/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'minimap-and-legend',
    title: 'Minimap and legend',
    description:
      '5,000 nodes with a minimap in a corner and a legend read from the color and size scales. The legend highlights a group under the pointer and fades it out on click.',
    hint: 'Drag the rectangle of the minimap to pan. Hover a group in the legend, click it to fade it out.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/minimap', '@bruno00o/graph/legend'],
    files: ['overview/main.ts', ...shared],
    load: () => import('./overview/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'export',
    title: 'Export to PNG and SVG',
    description:
      'Download the graph as a PNG drawn offscreen at twice the pixel density, or as a standalone SVG document, for the current view or the whole graph.',
    hint: 'Pan or zoom, then download: the file shows what you see. Switch the region to frame every node.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/export'],
    files: ['export/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./export/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
  {
    slug: 'map',
    title: 'Graph on a map',
    description:
      'Places drawn by longitude and latitude inside a MapLibre map, in the same WebGL context, on the globe or on a flat map. Long routes follow great circles, and a hull encloses the selection. The map pans and zooms; the graph handles hover, selection, the lasso and node drags. The PNG export draws the map, the graph and the attribution.',
    hint: 'Drag the map to turn the globe, scroll to zoom. Click a place to animate its routes, Shift and drag to draw a lasso.',
    tags: ['React'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/map', 'maplibre-gl'],
    files: ['map/main.tsx', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./map/main').then(({ Example }) => ({ kind: 'react', Example })),
  },
  {
    slug: 'collaboration',
    title: 'Collaboration across tabs',
    description:
      'Nodes read from a TanStack DB collection. Drag a node in one tab and watch it move in the other.',
    hint: 'Open this page in a second tab, then drag a node.',
    tags: ['React', 'TanStack DB'],
    modules: ['@bruno00o/graph/react', '@bruno00o/graph/db'],
    files: ['collab/main.tsx', ...shared],
    load: () => import('./collab/main').then(({ Example }) => ({ kind: 'react', Example })),
  },
  {
    slug: 'neighborhood-exploration',
    title: 'Neighborhood exploration',
    description:
      'Start from one node and load its neighbors on demand with TanStack Query. A double-click unfolds a neighborhood, another folds it.',
    hint: 'Double-click a node to unfold or fold it.',
    tags: ['React', 'TanStack Query'],
    modules: ['@bruno00o/graph/react', '@bruno00o/graph/query'],
    files: ['explore/main.tsx', 'explore/api.ts', ...shared],
    load: () => import('./explore/main').then(({ Example }) => ({ kind: 'react', Example })),
  },
  {
    slug: 'devtools',
    title: 'Devtools panel',
    description:
      'The panel of TanStack Devtools, inline under the graph: frame times, renderer timings, element counts, view and selection, updated as you interact.',
    hint: 'Pan and zoom to fill the frame chart. Change the node count to time a flush.',
    tags: ['React', 'TanStack Devtools'],
    modules: ['@bruno00o/graph/react', '@bruno00o/graph/devtools/react'],
    files: ['devtools/main.tsx', 'devtools/devtools.css', ...shared],
    load: () => import('./devtools/main').then(({ Example }) => ({ kind: 'react', Example })),
  },
  {
    slug: 'filter-at-scale',
    title: 'Filtering at scale',
    description:
      'Nodes come from a TanStack DB collection through a filtered subscription, so a new filter only moves the rows that enter or leave it. Edges load on demand from a simulated server, a few at a time.',
    hint: 'Change the filter and read the timings. Double-click a node to load its edges.',
    tags: ['Vanilla', 'TanStack DB'],
    modules: ['@bruno00o/graph', '@bruno00o/graph/db'],
    files: ['filter/main.ts', 'filter/links.ts', 'shared/data.ts', 'shared/messages.ts'],
    load: () => import('./filter/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
  },
]

export const exampleTags: readonly ExampleTag[] = [
  'Vanilla',
  'React',
  'TanStack DB',
  'TanStack Query',
  'TanStack Devtools',
]

export function findExample(slug: string): ExampleEntry | undefined {
  return examples.find((example) => example.slug === slug)
}
