# Glide of a mouse wheel

A notch of a mouse wheel eases the view to where a jump would have taken it, in `interaction.wheelGlide` milliseconds (200 by default). The glide starts fast and slows down, and the point under the pointer stays under it. Notches that arrive during a glide add to where it was going, so a run of notches ends on the view that the same jumps would give.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
declare const items: Item[]

const quick = defineGraph({ marks: [nodes(items)], interaction: { wheelGlide: 120 } })
const jumps = defineGraph({ marks: [nodes(items)], interaction: { wheelGlide: 0 } })
```

`wheelGlide` is a finite number, 0 or more: anything else makes `defineGraph` throw a `RangeError`. 0 gives back one jump per notch. It applies to the `'zoom'` mode, to the pan of a notch in `'pan'` mode, and to Cmd or Ctrl with the wheel in every mode. It does nothing in `'page'` mode, over the lens (which changes its magnification at once), for a Safari pinch, in the minimap and the timeline, or on a map (the map owns the wheel).

## What counts as a notch

Only notches glide. A trackpad scroll or pinch, and a wheel that scrolls smoothly, send many small deltas that already follow the hand: the view follows them at once. The graph takes a wheel event for a notch when:

- its deltas are counted in lines or pages (`deltaMode` other than 0), as Firefox reports a mouse wheel on Windows and Linux;
- it carries whole wheel ticks, a multiple of 120 in `wheelDelta`, that a trackpad would not give for its pixel delta (a trackpad reports three times the delta);
- or its pixel delta is a fixed-point line step, as a macOS mouse reports in Chrome and Safari.

Firefox on macOS reports the notches of a mouse in pixels, like a trackpad scroll, so they never glide there: it is a limit of what the browser sends, not a setting. An event taken for a notch by mistake glides for at most twice the time since the previous wheel event, a few milliseconds while a trackpad scrolls.

The duration of a glide is the smaller of `wheelGlide` and twice the time since the previous wheel event, so a fast spin of the wheel keeps up with the hand.

## When the view jumps instead

- With `prefers-reduced-motion`.
- When a frame takes more than half of the glide. The graph measures the cost of its frames and the time between two steps, so a large graph drawn in software jumps by itself.
- With `wheelGlide: 0`.

## What stops a glide

A press, a touch pinch, a Safari pinch, the zoom and fit keys, any call of `graph.view` that moves the view (`set`, `fit`, `zoomBy`) and the framing that follows a layout. A notch during one of these animations starts from the view shown at that moment and replaces it. When the pointer moves between two notches, the next notch zooms around the new point.

## Reading the view

The glide moves the view over `wheelGlide` milliseconds: `graph.view.get()` right after a wheel event is not the final view, and `viewchange` fires on every frame of the glide, with `origin: 'user'`. Read the view when you need it, or save it once the changes stop:

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
declare const items: Item[]

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})

let timer: ReturnType<typeof setTimeout> | undefined
graph.on('viewchange', ({ origin }) => {
  if (origin !== 'user') return
  clearTimeout(timer)
  timer = setTimeout(() => localStorage.setItem('view', JSON.stringify(graph.view.get())), 250)
})
```

In a controlled view (view skill), each frame of the glide is a request that `onViewChange` receives with `origin: 'user'`, and `update({ view })` applies it. A test that sends wheel events and reads the view right after sets `wheelGlide: 0` in its definition.
