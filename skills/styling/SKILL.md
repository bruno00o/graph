---
name: styling
description: >
  Use when styling @bruno00o/graph nodes and labels, with color and size scales,
  label size, placement and backgrounds, images, tinted icons and badges, box
  nodes that fit their label, outlines, or light and dark themes through CSS
  variables.
metadata:
  purpose: >
    How nodes and labels get their look in @bruno00o/graph: the three scales and
    when a value skips them, label options, shapes and boxes, outlines, images,
    tinted icons and badges, and the CSS variables of the light and dark themes,
    with the mistakes that draw the wrong color, size or text.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/types.ts
  - src/marks.ts
  - src/theme/tokens.ts
  - src/core/node-order.ts
  - src/theme/theme.css
  - docs/content/docs/(guide)/marks.mdx
  - docs/content/docs/(guide)/labels.mdx
  - docs/content/docs/(guide)/scales.mdx
  - docs/content/docs/(guide)/images-and-badges.mdx
  - docs/content/docs/(guide)/theming.mdx
  - docs/content/docs/api/nodes.mdx
  - docs/content/docs/api/theme-tokens.mdx
requires:
  - core
---

# Style nodes and labels

Load the core skill first (`intent load @bruno00o/graph#core`): data, keys, marks and states work as described there. This skill covers how a node looks: scales, labels, shapes, images, badges and themes. Edge looks (arrows, dashes, flows, ends, labels on edges) belong to the edges skill. The `shape` of a node (circle, square, diamond, box) is not the `shapes()` mark: free areas and lines with their own geometry belong to the shapes skill.

## Setup

1. Import the theme once. It defines every `--graph-*` color for the light and the dark theme. Without it the graph is drawn with the light values, and a dark page never gets the dark ones. TypeScript checks this side-effect import against CSS module types: bundlers declare them (`vite/client`), otherwise add `declare module '*.css'` to a `.d.ts` file.

   ```ts no-check
   import '@bruno00o/graph/theme.css'
   ```

2. Pick the family of every value you want to style. One rule decides it:

   - A **channel** (`color`, `size`, `label` and its `text` and `secondary`) takes a field name or a function, and its value goes through a scale.
   - A **style** (`fill`, `stroke`, `strokeWidth`, `outline`, `outlineWidth`, `opacity`, `shape`, `width`, `cornerRadius`, `image`, and every other label option) takes a constant or a function of the item, never a field name, and is drawn as given.
   - A number literal and a function wrapped in `raw()` skip the scale of their channel.

3. Colors are CSS strings, resolved by the browser: hex, `var(--graph-cat-3)`, `color-mix(...)`. A color given as a `--graph-*` variable follows the theme without any update.

## Core Patterns

### Scales for color, size and width

Three scales exist: `color` (nodes, edges and the shapes of `shapes()` marks), `size` (node diameter) and `width` (edge width). A scale is shared by every mark of the definition that has none of its own, so one value takes one color on a node, an edge and a shape. Without options:

| Scale | Default |
| --- | --- |
| `color` | Categorical: each distinct value takes the next of `--graph-cat-1` to `--graph-cat-12`, in order of appearance, cycling |
| `size` | Square root from the data extent to `[8, 32]`, so the area follows the value |
| `width` | Linear from the data extent to `[1, 6]` |

Configure them in `defineGraph`:

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; group: string; weight: number; score: number }
type Link = { id: string; from: string; to: string; strength: number }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to', width: 'strength' }),
    nodes(items, { color: 'group', size: 'weight', label: 'name' }),
  ],
  scales: {
    color: {
      domain: ['A', 'B', 'C'],
      range: ['var(--graph-cat-3)', 'var(--graph-cat-1)', 'var(--graph-cat-7)'],
    },
    size: { type: 'linear', range: [10, 40] },
    width: { range: [1, 4] },
  },
})
```

- Categories listed in `domain` take the first colors of `range`, in that order. Others follow as they appear (in one update: nodes first, then edges, then shapes) and wrap around when the range runs out. On a mark with a `history` (time skill), they follow the whole journal, not the cursor: the values of the items first, then those of the entries by the date of their first appearance, so a color stays the same whatever moment shows first. A sequential scale reads the extent of all three kinds together.
- A number scale takes `{ type: 'linear' | 'sqrt', domain, range }`. Values outside an explicit `domain` are clamped. When the data holds a single value, the scale keeps it, clamped to the range.
- A scale can be a function: `size: (value) => 8 + Math.log10(1 + value) * 8`, or `color: (value) => ...` returning a CSS color. Keep it pure: the same value gives the same result.
- A channel that returns `null` or `undefined`, or a mark without that channel, takes the theme default: `--graph-node` and 16 for nodes.
- Scale options are compared by content: a rebuilt definition with the same scales rewrites nothing, and a changed scale restyles every element that uses it and resets its categories.

For a gradient, the color scale must be sequential. It interpolates from `--graph-cat-5` to `--graph-cat-1` by default, in steps of one percent:

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; score: number }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items, { color: 'score' })],
  scales: {
    color: {
      type: 'sequential',
      domain: [0, 100],
      range: ['var(--graph-cat-5)', 'var(--graph-cat-1)'],
    },
  },
})
```

Examples: [categorical colors](https://bruno00o.github.io/graph/examples/categorical-colors), [sequential colors](https://bruno00o.github.io/graph/examples/sequential-colors), [size scale](https://bruno00o.github.io/graph/examples/size-scale).

### Skip the scale: literals and raw

`size: 24` draws every node 24 pixels wide. `size: raw((item) => item.radius * 2)` draws each node at the diameter it returns. `raw()` also works on `color`, which then returns a CSS color used as is. Raw values stay out of the extent and the categories of their scale, so they never move the other elements, and a raw color has no category in the legend.

```ts
import { nodes, raw } from '@bruno00o/graph'

type Item = { id: string; radius: number; hex: string }
const items: Item[] = []

const fixed = nodes(items, { size: 24 })
const measured = nodes(items, {
  size: raw((item) => item.radius * 2),
  color: raw((item) => item.hex),
})
```

`color` takes no literal: one color for every node, or a color per item that must stay out of the scale, is the style `fill`. `fill` wins over `color`. Colors from `fill`, `stroke`, `raw()` or states go through no scale, so the legend has no category for them: declare legend `entries` with the same values (tools skill).

### Scales of one mark

A mark with `scales` keeps its values apart: its own extent, categories and legend section. Nodes take `color` and `size`, edges `color` and `width`, shapes `color` only (`ShapeScalesOptions`, shapes skill). Use it when two node marks measure different things, so a large score in one does not shrink the nodes of the other.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; group: string; weight: number }
type Topic = { id: string; kind: string; score: number }
const items: Item[] = []
const topics: Topic[] = []

const definition = defineGraph({
  marks: [
    nodes(items, { color: 'group', size: 'weight' }),
    nodes(topics, {
      name: 'topic',
      color: 'kind',
      size: 'score',
      scales: {
        color: { range: ['var(--graph-cat-9)', 'var(--graph-cat-11)'] },
        size: { range: [24, 64] },
      },
    }),
  ],
})
```

The scales of a mark follow its `name`: a named mark keeps its categories and extents when marks are reordered or its data is replaced. An unnamed one keeps them while its elements stay at the same position among the marks.

### Node labels

`label` takes a field or a function for the text, or an object. `text` and `secondary` are channels; every other option is a style.

```ts
import { nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; group: string; weight: number; flagged: boolean }
const items: Item[] = []

const labelled = nodes(items, {
  label: {
    text: 'name',
    secondary: 'group',
    size: (item) => 10 + item.weight / 2,
    weight: (item) => (item.weight > 8 ? 'bold' : 'normal'),
    color: 'var(--graph-ink)',
    placement: 'right',
    maxWidth: 120,
    minScreenSize: 16,
    background: (item) => (item.flagged ? 'var(--graph-cat-2)' : true),
  },
})
```

- The text must be a non-empty string. A number, `null`, `undefined` or an empty string draws no label: convert with `String(...)`. `\n` starts a new line, and `secondary` adds a smaller second line.
- `size` is in pixels at zoom 1 (12 by default). Labels shrink when you zoom out and keep their size when you zoom in; a label under 8 pixels on screen is hidden, so a larger `size` stays readable from further away. `minScreenSize` hides the label of nodes smaller than that diameter on screen; hovered and focused nodes ignore it. Nodes with `units: 'screen'` keep their labels at one size at every zoom.
- `weight` is `'normal'`, `'bold'` or a number (500 by default). `font` is a CSS family and defaults to `--graph-font`. A web font that loads after the first frame is picked up.
- `placement` is `'bottom'` (default), `'top'`, `'right'`, `'left'` or `'center'`, on the node. `maxWidth` cuts each line with an ellipsis, in pixels at zoom 1 like `size`: it shrinks with the label when you zoom out.
- `background: true` draws a plate in `--graph-label-background`; a CSS color picks another; `false` or `null` draws none. A plated label has no halo.
- Labels never overlap and at most 4,000 are drawn. They are chosen again as the view changes, at most every 120 ms: hovered and focused first, then selected, then the largest nodes. A label that is missing may have lost the overlap test or fallen under 8 pixels: zoom in before looking for a bug.
- A state styles labels too: `label: true | false | 'always'` and `labelColor`, set in `states`. `'always'` lifts the size threshold while the state applies.
- Edges and the `shapes()` mark take labels too, with the same text options and placed after node labels (edges in the edges skill, shapes in the shapes skill).

Example: [labels](https://bruno00o.github.io/graph/examples/labels).

### Shapes, boxes and contours

`shape` is `'circle'` (default), `'square'`, `'diamond'` or `'box'`. A box is a rectangle with rounded corners whose label sits on it.

```ts
import { nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; weight: number }
const items: Item[] = []

const boxes = nodes(items, {
  shape: 'box',
  size: 28,
  label: 'name',
  cornerRadius: 6,
  fill: (item) => (item.weight > 5 ? 'var(--graph-cat-1)' : 'var(--graph-cat-6)'),
})

const rings = nodes(items, {
  stroke: 'var(--graph-ink)',
  strokeWidth: 2,
  outline: (item) => (item.weight > 5 ? 'var(--graph-cat-2)' : null),
  outlineWidth: 3,
})
```

- On a box, `size` is the height. `width` is `'label'` by default (the longer label line plus half the height on each side, never narrower than tall), or a number in the units of `size`; a fixed width cuts the label with an ellipsis unless it sets its own `maxWidth`. `cornerRadius` defaults to a quarter of the height. Give a label with two lines a box tall enough for both. Edges, picking, hulls and exports follow the box border.
- A label drawn inside its node (always on a box, on other shapes with `placement: 'center'` when it fits) has no halo, and without a `color` its text takes `--graph-ink` or `--graph-paper`, whichever contrasts more with the fill, in both themes.
- `stroke` and `strokeWidth` draw a contour inside the shape (1 pixel, `--graph-node-ring` by default). `outline` and `outlineWidth` draw a ring outside it, in screen pixels. `outline` alone is 2 pixels wide, `outlineWidth` alone takes `--graph-node-ring` (the page color, so it reads as a gap), and an `outline` that returns `null` draws none whatever the width. A state halo (`halo: true`, or `{ color, width }` per state, interaction skill) starts outside the outline.
- `units: 'screen'` keeps the node size in pixels at every zoom, for markers. Edge widths are always screen pixels. Nodes placed by `longitude` and `latitude` are in screen units by default.

- Nodes of a mark draw in the order they arrived. `order` (a field name or a function of the item) draws nodes with a lower value first, under the others, and the top node is the one a click picks. A node without a value counts as 0, and equal values keep the usual order. It holds inside each mark and each layer and in the PNG and SVG exports; a raised node (selected, hovered) still draws above every mark, and labels keep their own priority, by size. Sorting again after a change of order costs about 20 ms at 500,000 nodes.

```ts
import { nodes } from '@bruno00o/graph'

type Place = { id: string; count: number }
const places: Place[] = []

const stacked = nodes(places, { size: 'count', order: (place) => -place.count })
```

Examples: [node shapes](https://bruno00o.github.io/graph/examples/node-shapes), [draw order](https://bruno00o.github.io/graph/examples/draw-order), [box nodes](https://bruno00o.github.io/graph/examples/box-nodes), [stroke and outline](https://bruno00o.github.io/graph/examples/stroke-and-outline), [screen units](https://bruno00o.github.io/graph/examples/screen-units).

### Images, tinted icons and badges

`image` draws a picture inside the node, cropped to cover its shape, on the fill and under the contour. It takes a URL or `{ src, scale, color }`, or `null` for none. `scale` is the size of the image relative to the node diameter (1 by default); `color` is any CSS color. With `color`, the image becomes a mask painted in that color, so a one-color SVG icon follows the theme.

```ts
import { nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; weight: number; picture: string | null }
const items: Item[] = []

const pictures = nodes(items, {
  size: 40,
  image: (item) => (item.picture ? { src: item.picture, scale: 1 } : null),
  outline: 'var(--graph-cat-1)',
  label: { text: 'name', background: true },
})

const icons = nodes(items, {
  fill: 'var(--graph-paper-raised)',
  image: { src: '/icons/circle.svg', scale: 0.6, color: 'var(--graph-ink)' },
  badges: {
    topRight: (item) => (item.weight > 5 ? { text: item.weight } : null),
    bottomLeft: (item) => (item.weight < 2 ? { fill: 'var(--graph-cat-4)' } : null),
    bottomRight: (item) => ({
      image: { src: '/icons/bell.svg', color: 'white' },
      text: item.weight,
      stroke: 'var(--graph-paper)',
      strokeWidth: 3,
    }),
  },
})
```

- At most 256 distinct images are drawn at once, each stored once in a texture whose layers are 256 by 256 pixels. Past that, the other nodes stay plain, nothing is fetched for them, and development builds warn. Share icons between nodes, and put text in labels, never in an image per node.
- Images load in the background and appear when ready. A failed image is not retried.
- Badges sit in the corners `topLeft`, `topRight`, `bottomLeft` and `bottomRight`: each corner is a function that returns `{ text, image, fill, color, stroke, strokeWidth, minSize }` or `null`. `text` is a string or a number, `fill` the pill color (`--graph-badge-fill`) and `color` the text color (`--graph-badge-ink`). Without `text` nor `image` a badge is a dot. `image` puts an icon at the start of the pill, before the text, which grows to hold both: a URL or `{ src, scale, color }` like a node image, cropped to a circle as high as the pill, `scale` 0.7 by default (1 covers the circle, for a picture), `color` painting it as a mask that follows the theme. `stroke` and `strokeWidth` set the ring around the pill (`--graph-node-ring`, 1.5 pixels; `0` for none), wider on a dark node or a busy map. The pill is 0.55 times the node diameter high on screen, up to 18 pixels, and hides while it is under `minSize` pixels high (10 by default); its text shows from `minSize` and 12 pixels at least. Badges are not picked, and a click on one reaches the node. On a box they sit on its corners; a group shows its badges folded, and unfolded only with `container.badges` (groups skill).
- Badge icons share the 256 images of node images: an icon used by both counts once.
- Pair an image with `outline` or a label `background` so it reads over its neighbors and edges.

Example: [images and badges](https://bruno00o.github.io/graph/examples/images-and-badges).

### Themes and CSS variables

Every color the graph reads is a `--graph-*` variable of `theme.css`: `--graph-paper` and `--graph-paper-raised`, `--graph-ink` (the text color) and `--graph-ink-muted`, `--graph-node`, `--graph-edge`, `--graph-accent`, `--graph-label-halo`, `--graph-label-background`, `--graph-node-ring`, `--graph-badge-fill`, `--graph-badge-ink`, `--graph-cat-1` to `--graph-cat-12` (`cat-5` to `cat-1` is the sequential scale), `--graph-grid`, `--graph-group-fill`, `--graph-shape-fill` and `--graph-shape-stroke` (the default fill and outline of `shapes()` marks, shapes skill) and `--graph-font`. The theme tokens page lists every value.

- The dark theme applies under an element with the class `dark` or `data-theme="dark"`, or when the system prefers dark and the root has neither the class `light` nor `data-theme="light"`. The light theme applies to `:root`, `.light` and `data-theme="light"`. Both can be forced on any element, and the nearest ancestor wins, so a light graph can sit in a dark page.
- Switching themes rewrites no data: the graph resolves its colors again when a class or `data-theme` changes on the graph element or an ancestor, a `style` changes above it, or the system preference changes.
- Override a token in your own CSS, after the import, on any element above the graph. A token changed at run time recolors the graph the same way.

```css
:root {
  --graph-cat-1: #0f7173;
}

.dark {
  --graph-node: #98c1d9;
}
```

- In options, prefer `var(--graph-…)` to a hex value, so a color follows the theme. A hex value stays the same in both themes.
- The canvas is transparent: the page paints the background, with `--graph-paper` if you want the theme one.

Example: [theme tokens](https://bruno00o.github.io/graph/examples/theme-tokens).

## Common Mistakes

### HIGH Expecting a gradient from a numeric color

The color scale is categorical by default, even for numbers: nothing is guessed. A `color` channel that returns scores draws one palette color per distinct score, with no order. Ask for the sequential scale.

Wrong:

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; score: number }
const items: Item[] = []

const definition = defineGraph({ marks: [nodes(items, { color: 'score' })] })
```

Correct:

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; score: number }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items, { color: 'score' })],
  scales: { color: { type: 'sequential', domain: [0, 100] } },
})
```

Source: [Scales](https://bruno00o.github.io/graph/docs/scales#color).

### HIGH A computed pixel size that goes through the scale

A function given to `size` is a channel: its result is squeezed into `[8, 32]` by the square root scale, so `(item) => item.radius * 2` never draws the diameters it returns. Use a number literal for one size, `raw()` for a diameter per item, or set the scale `range`.

Wrong:

```ts
import { nodes } from '@bruno00o/graph'

type Item = { id: string; radius: number }
const items: Item[] = []

const squeezed = nodes(items, { size: (item) => item.radius * 2 })
```

Correct:

```ts
import { nodes, raw } from '@bruno00o/graph'

type Item = { id: string; radius: number }
const items: Item[] = []

const exact = nodes(items, { size: raw((item) => item.radius * 2) })
```

Source: [Channels and styles](https://bruno00o.github.io/graph/docs/marks#channels-and-styles).

### HIGH A field name in a style

Styles take a constant or a function, never a field name. A numeric style given a field name does not compile.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; weight: number }
const items: Item[] = []

nodes(items, { label: { text: 'name', size: 'weight' } })
```

A color style is a string, so a field name there compiles and draws a wrong color, because it is read as a CSS color. Write a function: `fill: (item) => item.hex`.

Source: [Channels and styles](https://bruno00o.github.io/graph/docs/marks#channels-and-styles).

### HIGH A constant color in the color channel

`color` is a channel: a CSS color there does not compile, and a function that returns CSS colors still draws palette colors, one per distinct value. Use `fill`, or `raw()` for a color that must stay out of the scale. The core skill shows the failing call.

### MEDIUM A label that is not a string

`label` draws only a non-empty string. A function that returns a number does not compile, and a missing value draws nothing. Convert: `label: (item) => String(item.count)`.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'

type Item = { id: string; count: number }
const items: Item[] = []

nodes(items, { label: (item) => item.count })
```

### MEDIUM The theme stylesheet is missing

Without `@bruno00o/graph/theme.css` every variable falls back to its light value: labels stay dark on a dark page, and `.dark` or `data-theme="dark"` changes nothing. The library never injects the stylesheet.

### MEDIUM Large nodes covering small ones at one place

Nodes at the same place draw in the order they arrived, so a large one that arrived last covers a small one, and a click picks the node on top. Give the mark an `order` that puts the large ones first (lower values draw first): `order: (place) => -place.count`. Sorting the data array is no substitute: a node already in the graph keeps its place. Nodes at the very same point can also move apart on screen with `spread: true` in `defineGraph` (map skill).

```ts
import { nodes } from '@bruno00o/graph'

type Place = { id: string; count: number }
const places: Place[] = []

const mark = nodes(places, { size: 'count', order: (place) => -place.count })
```

### MEDIUM A legend that cannot explain colors set by rules

A graph colored by `fill` functions or by states shows those colors with no legend category: the legend reads the scales, not the styles. Keep the rule in one function, use it in the style, and give it to a legend entry with the same color (tools skill, `references/legend-entries.md`).

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend } from '@bruno00o/graph/legend'

type Item = { id: string; weight: number }
declare const items: Item[]
const heavy = (item: Item) => item.weight >= 40
const fill = (item: Item) => (heavy(item) ? 'var(--graph-cat-1)' : 'var(--graph-node)')

const definition = defineGraph({ marks: [nodes(items, { fill })] })
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })
const swatch = { kind: 'nodes', fill: 'var(--graph-cat-1)' } as const
const entries = [{ id: 'heavy', label: 'Heavy', swatch, nodes: heavy }]
createLegend(graph, { entries: [{ title: 'Weight', entries }] })
```

### MEDIUM One image per node

An SVG that spells each node name, or a distinct URL per node, hits the 256 image limit at the 257th node: the rest stay plain circles, with a development warning. Share a few icons, and write text with `label`.

### MEDIUM A tinted icon that is not a single color

`color` turns the alpha channel of the image into a mask. A multicolor picture becomes a flat silhouette. Leave out `color` to keep the colors of the image.

### MEDIUM Hard-coded colors that ignore the theme

A hex value in `fill`, `stroke` or a label `color` is the same in light and dark: dark text on a dark page. Use `var(--graph-ink)`, `var(--graph-paper-raised)` or `var(--graph-cat-n)`, or `color-mix(in srgb, var(--graph-paper) 85%, transparent)` for a tint.

### MEDIUM Option functions rebuilt on every update

A scale function or a label option function created on every update restyles every element of its mark. Declare them once, as for any option function (core skill).

## Completion

The task is done when:

- `theme.css` is imported once and the graph looks right in light and dark;
- each value uses the right family: a field or function for a channel, a constant or function for a style, `raw()` or a literal for a value that must skip the scale;
- gradients use a sequential color scale, and sizes in pixels use a literal or `raw()`;
- labels are strings, and sized so they stay readable over the zoom range of the view;
- images are shared between nodes, well under 256 distinct ones;
- colors come from `--graph-*` variables unless they must be identical in both themes;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- Guides: [Draw order](https://bruno00o.github.io/graph/docs/marks#drawing-order), [Marks and channels](https://bruno00o.github.io/graph/docs/marks), [Scales](https://bruno00o.github.io/graph/docs/scales), [Labels](https://bruno00o.github.io/graph/docs/labels), [Images and badges](https://bruno00o.github.io/graph/docs/images-and-badges), [Theming](https://bruno00o.github.io/graph/docs/theming)
- API: [nodes](https://bruno00o.github.io/graph/docs/api/nodes), [Theme tokens](https://bruno00o.github.io/graph/docs/api/theme-tokens)
- The legend explains colors, sizes and shapes to the reader: see the tools skill, or [Minimap and legend](https://bruno00o.github.io/graph/docs/minimap-and-legend#legend).
