# Rendering: many graphs, suspension and the pixel ratio

Each graph draws in a WebGL context of its own canvas. This page covers what to do when a page holds many graphs, how a suspended graph behaves, and how many canvas pixels a graph draws, with a GPU or in software. In React, the `suspended` and `keepFrame` props do the same through `<Graph>` (react skill).

## Suspend the graphs out of sight

Chrome and Safari keep at most 16 WebGL contexts per page, Firefox more. Each graph takes one, and a PNG export one more while it draws; the minimap draws without WebGL and the GPU engine of the force layout takes its context in a worker, which does not count. Past the limit, the browser takes the oldest context away.

```ts
import { defineGraph, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
declare const items: Item[]
declare const cards: HTMLElement[]

const definition = defineGraph({ marks: [nodes(items, { label: 'label' })] })
const graphs = new Map<Element, GraphInstance>()
for (const card of cards) {
  graphs.set(card, mountGraph(card, { definition, ariaLabel: 'Sample graph', suspended: true }))
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const graph = graphs.get(entry.target)
    if (entry.isIntersecting) graph?.resume()
    else graph?.suspend()
  }
})
for (const card of cards) observer.observe(card)
```

- `suspend()` draws a last frame, copies it onto a 2D canvas laid over the graph, then frees the context with its textures and buffers. Data and live sources, layouts, the view, the selection, the states, the time window, the events, the store, the companions and the exports go on. A drag or a lasso in progress ends, the hover and a lens that follows the pointer go away (a lens set at a point stays, shows on the copy and is there after `resume`), and the canvas takes no pointer event until it resumes.
- `resume()` takes a context again and draws the graph as it is now; the copy stays until that frame. At 100,000 nodes and 200,000 edges it comes 60 to 120 ms after `resume`, where the first frame after the mount takes 300 to 450 ms. `await graph.drawn()` waits for it, and waits for `resume` as long as the graph is suspended.
- `suspended: true` at mount creates no context until `resume`: the graph reads its data, lays it out, answers every call and fills its store. It is read at the mount only.
- The copy costs width × height × pixel ratio² × 4 bytes, about 1.9 MB for 800 × 600 CSS pixels at a ratio of 1 and 7.7 MB at a ratio of 2. It goes away when the theme or the palette changes, since it would show the old colors. `keepFrame: false` (at mount or in `update`, `true` by default) keeps none: `suspend` frees the context at once, and the page shows an empty box until `resume` has drawn.
- Each call that changes something updates `suspended` in the store and emits `suspendchange` (`{ suspended }`); a call that changes nothing emits nothing. After `destroy`, both do nothing.
- On a map, the graph draws in the context of the map: it keeps drawing there, and `suspend` only frees its own canvas for its return.

## Contexts the browser takes

A graph whose context the browser took, because the page asked for more than 16, stays empty in Chrome and Safari, which never give such a context back. `resume()` gets it back, on a graph suspended or not: the graph asks the browser to restore its context and draws again, at the price of the oldest context of another graph. On a graph that lost nothing it does nothing. Nothing restores a context on its own, since taking one from another graph would start a loop: suspend the graphs out of sight first, and call `resume()` on those that come into sight. While a context is lost, the canvas is hidden and takes no pointer event. Only the drawing stops: data, layouts, the view, controlled requests and companions go on as for a suspended graph, and `drawn()` waits until the context is back.

Safari still counts the context of a suspended graph. With more than 16 graphs, its console reports `There are too many active WebGL contexts on this page, the oldest context will be lost.` and `WebGL: INVALID_OPERATION: loseContext: context already lost`: the graph makes sure Safari takes a context that is already free, no shown graph loses its own. Firefox reports `WebGL context was lost.` for each suspended graph, which is expected.

## The pixel ratio and software rendering

`pixelRatio` in `defineGraph` sets the canvas pixels per CSS pixel:

```ts
type PixelRatioOption = 'auto' | 'device' | number
```

- `'auto'`, the default, follows the device pixel ratio, but draws one canvas pixel per CSS pixel when WebGL runs in software, so a frame shades up to 4 times fewer pixels on a screen of ratio 2 and the graph is less sharp. `'device'` follows the device with any renderer. A number above 0 sets the ratio: `1` spends less on a weak GPU, `3` draws finer than the screen.
- The largest drawing buffer of the device caps every ratio. A new definition with another ratio resizes the canvas at once. On a map, the map sets the ratio and `pixelRatio` changes nothing.
- `defineGraph` throws a `TypeError` for a value that is neither `'auto'`, `'device'` nor a number, and a `RangeError` for a number that is not finite or not above 0.
- `exportPng` takes the ratio the graph draws at by default (export skill): pass its own `pixelRatio` for a sharper image.

Without a usable GPU, some browsers draw WebGL on the CPU (virtual machines, remote desktops, test runners). The graph recognizes it by the renderer name and draws plain triangles from a chunk loaded only then, with the same picture pixel for pixel; `drawn()` waits for that chunk. Bundled and routed edges, waypoints, shapes and hulls keep their instanced draws. The devtools panel shows the drawing (GPU or software) and the pixel ratio with its reason (tools skill). Frames while the view moves, the whole graph in view at 1280 × 800 pixels:

| Graph | Chrome, 12 cores | Chrome, 4 cores | Firefox, 4 cores |
| --- | --- | --- | --- |
| 1,000 nodes and 2,000 edges | 6 ms | 18 ms | 17 ms |
| 10,000 nodes and 20,000 edges | 32 to 43 ms | 190 to 200 ms | 100 to 105 ms |
| 50,000 nodes and 100,000 edges | 150 to 205 ms | 0.9 to 1.1 s | 480 to 530 ms |

The first frame takes 2 to 2.5 s in Chrome and about 1 s in Firefox. Software rendering suits graphs of a few tens of thousands of elements on a desktop processor, fewer on a virtual machine of a few cores: past that, filter or aggregate the data first.

## Common mistakes

### MEDIUM Passing `suspended` to `update`

`suspended` is read at the mount only, and `update` does not take it: the call does not compile. Call `graph.suspend()` and `graph.resume()` after the mount.

```ts expect-error=TS2353
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
declare const items: Item[]

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})
graph.update({ suspended: true })
```

### MEDIUM Waiting for a lost context to come back

With more graphs than contexts, a graph whose context the browser took stays empty in Chrome and Safari, and nothing brings it back by itself. Call `resume()` on it when it comes into sight, after suspending the graphs out of sight so that it does not take the context of a shown one.

### MEDIUM A blurry graph when WebGL runs in software

With `pixelRatio: 'auto'`, a graph drawn in software takes one canvas pixel per CSS pixel and looks soft on a screen of ratio 2. When the frames are cheap enough (small graphs, several cores), pass `pixelRatio: 'device'`; to spend less on a weak GPU too, pass `1`.
