import type { GraphInstance } from '@bruno00o/graph'
import type { ComponentType, Ref } from 'react'

export type ExampleTag = 'Vanilla' | 'React' | 'TanStack DB' | 'TanStack Query'

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
    slug: 'layouts',
    title: 'Layouts',
    description:
      'A directed graph laid out in layers, in any direction, then with forces, on a grid sorted by group, in rings by degree and as a radial tree. Nodes glide to their new place and the view frames the result.',
    hint: 'Switch the layout or the direction. Shift and drag around some nodes, then arrange only them.',
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
    slug: 'parallel-edges',
    title: 'Parallel edges and loops',
    description:
      'Several edges between the same two nodes bend apart, loops nest around their node, with arrows, dashes and labels per edge.',
    hint: 'Drag a node: the curves and their labels follow. Hover an edge to read its direction.',
    tags: ['Vanilla'],
    modules: ['@bruno00o/graph'],
    files: ['edges/main.ts', 'shared/messages.ts', 'shared/overlays.css'],
    load: () => import('./edges/main').then(({ mount }) => ({ kind: 'vanilla', mount })),
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
]

export const exampleTags: readonly ExampleTag[] = [
  'Vanilla',
  'React',
  'TanStack DB',
  'TanStack Query',
]

export function findExample(slug: string): ExampleEntry | undefined {
  return examples.find((example) => example.slug === slug)
}
