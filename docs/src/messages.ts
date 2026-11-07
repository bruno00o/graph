const numbers = new Intl.NumberFormat('en-US')

export function formatNumber(value: number): string {
  return numbers.format(value)
}

export const messages = {
  siteName: 'graph',
  siteTitle: '@bruno00o/graph',
  pageTitle: (title: string) => `${title} | graph`,
  siteDescription: 'Typed graph visualization for any framework, rendered with WebGL2.',
  nav: { docs: 'Docs', api: 'API', examples: 'Examples', benchmark: 'Benchmark' },
  github: 'GitHub',
  npm: 'npm',
  changelog: 'Changelog',
  version: (version: string) => `Version ${version}`,
  license: 'Released under the MIT License.',
  search: {
    placeholder: 'Search the docs',
    none: 'No results. Try another word.',
  },
  docs: {
    edit: 'Edit this page on GitHub',
  },
  apiTable: {
    name: 'Name',
    type: 'Type',
    default: 'Default',
    description: 'Description',
  },
  code: {
    copy: 'Copy the code',
    copied: 'Copied',
  },
  examples: {
    title: 'Examples',
    lead: 'Each example shows one idea and runs in the page next to its full source. Open one to try it, read the code, or take it full screen.',
    search: 'Search the examples',
    searchPlaceholder: 'Search by title or description',
    categories: 'Category',
    tags: 'Framework and integrations',
    all: 'All',
    results: (shown: number, total: number) =>
      shown === total
        ? `${formatNumber(total)} examples`
        : `${formatNumber(shown)} of ${formatNumber(total)} examples`,
    none: 'No example matches these filters.',
    clear: 'Clear the filters',
    preview: (title: string) => `Preview of the ${title} example`,
    related: 'Read more',
    guide: 'Guide',
    api: 'API reference',
    previous: 'Previous example',
    next: 'Next example',
    pager: 'More examples',
    breadcrumb: 'Breadcrumb',
    sourceOnGithub: 'Source on GitHub',
    openFullScreen: 'Open full screen',
    restart: 'Restart',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit the graph',
    fullScreen: 'Full screen',
    exitFullScreen: 'Exit full screen',
    loading: 'Loading the example',
    readSource: 'Read the source',
  },
  home: {
    title: 'Typed graph visualization for any framework',
    lead: 'Map your data to nodes and edges, style them with named states and CSS variables, and draw tens of thousands of elements with WebGL2.',
    installPrompt: '$',
    install: 'pnpm add @bruno00o/graph',
    installCopy: 'Copy the install command',
    readDocs: 'Read the docs',
    browseExamples: 'Browse examples',
    heroLabel: 'Sample graph of eight groups',
    heroCount: (nodes: number, edges: number) =>
      `${formatNumber(nodes)} nodes, ${formatNumber(edges)} edges`,
    heroHint: 'Drag a node, scroll to zoom, click to select.',
    group: 'group',
    groupTooltip: (group: string, weight: number) =>
      `Group ${group}, weight ${formatNumber(weight)}`,
    describeTitle: 'Describe the graph, then mount it',
    describeLead:
      '`defineGraph` collects your marks, scales and states into one definition. `mountGraph` draws it into any element and returns an instance you drive from code.',
    describeSteps: [
      'Install the package and import its stylesheet.',
      'Map fields of your data to channels with `nodes()` and `edges()`.',
      'Mount the graph and respond to its events.',
    ],
    quickStart: 'Follow the quick start',
    coversTitle: 'What the library covers',
    coversLead:
      'One core with no framework dependency, a thin React adapter, and integrations you import by path only when you need them.',
    features: {
      webgl: {
        title: 'WebGL2 rendering',
        text: 'Positions, colors and states live in typed arrays on the GPU. Labels are chosen by size and drawn from a signed distance field atlas, so text stays sharp at every zoom level.',
      },
      typed: {
        title: 'Typed marks and channels',
        text: '`nodes()` and `edges()` map fields to color, size, label, position and shape. Field names are checked against your item type, so a typo fails to compile.',
      },
      states: {
        title: 'Named states',
        text: 'Selection, hover and focus are built in. Declare your own, such as `dimmed` or `pinned`, each with its own style, and combine them on any element.',
      },
      db: {
        title: 'TanStack DB collections',
        tag: '/db',
        text: 'Pass a collection where you would pass an array. Inserts, updates and deletes reach the graph as they happen, and `persistPositions` writes dragged positions back.',
      },
      query: {
        title: 'TanStack Query exploration',
        tag: '/query',
        text: '`createExploration` turns one query per node into a graph that unfolds on demand, with `expanded` and `loading` keys you can style as states.',
      },
      theming: {
        title: 'Theming with CSS variables',
        text: 'Every color is a custom property, from `--graph-paper` to `--graph-cat-8`. Switch themes with a class or `data-theme`: the graph resolves its palette again and repaints, without rebuilding anything.',
      },
      react: {
        title: 'React adapter',
        tag: '/react',
        text: '`<Graph>` mounts once and holds up under StrictMode. `useGraphState` reads hover, selection, view and states from the graph store.',
      },
      layout: {
        title: 'Force layout',
        tag: '/layouts/force',
        text: 'Nodes without coordinates settle in a Web Worker, on the GPU for large graphs, while the page keeps panning. New nodes land next to their neighbors, and a dragged node stays where you drop it.',
      },
      labels: {
        title: 'Styled labels',
        text: 'Size, color, weight, font and placement for each label, with line breaks and truncation. Edge labels follow their edge, and no two labels overlap.',
      },
    },
    figures: {
      statesFigure: 'A node in four states: default, hovered, selected and dimmed',
      collectionFigure:
        'Rows of a collection on the left, the same rows drawn as nodes on the right',
      explorationFigure:
        'A root node unfolded into its neighbors, two of them unfolded in turn, one still loading',
      typedFigure: 'An editor suggesting the fields of an item type for the color channel',
      default: 'default',
      hovered: 'hovered',
      selected: 'selected',
      dimmed: 'dimmed',
      swatchNames: ['paper', 'ink', 'edge', 'accent', 'cat-1 to cat-8'],
    },
    denseLabel: 'Five thousand nodes in eight groups',
    layoutLabel: 'Three thousand nodes settling into communities with a force layout',
    nodesFigure: 'nodes',
    edgesFigure: 'edges',
    figuresLink: 'See how these figures were measured',
    nextTitle: 'Where to go next',
    next: [
      {
        title: 'Docs',
        text: 'Guides from installation to theming, each example in Vanilla and React.',
        href: '/docs',
      },
      {
        title: 'API reference',
        text: 'Every function, option and type, with signatures and defaults.',
        href: '/docs/api',
      },
      {
        title: 'Examples',
        text: 'Live examples by topic, each next to its full source.',
        href: '/examples',
      },
    ],
    light: 'light',
    dark: 'dark',
  },
  notFound: {
    title: 'Page not found',
    lead: 'This page does not exist, or it moved.',
    home: 'Back to the home page',
  },
} as const
