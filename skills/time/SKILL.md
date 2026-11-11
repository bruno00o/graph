---
name: time
description: >
  Use when giving @bruno00o/graph nodes, edges and shapes a time or a period, showing
  only what exists in a time window, fading elements in and out at the edges of
  the window, controlling the window from application state, or adding a timeline
  with a histogram that brushes, steps and plays (default element, a renderer of
  your own, or the React Timeline component and useTimeline hook), also on a map
  graph.
metadata:
  purpose: >
    Time in @bruno00o/graph: the time channel of nodes, edges and shapes, the time
    window and its exact boundaries, the fade, the controlled window, the
    timeline companion with its store and actions, and the mistakes that leave
    everything showing, nothing playing or a window one moment off.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/timeline/index.ts
  - src/timeline/view.ts
  - src/core/time-range.ts
  - src/react/index.tsx
  - src/types.ts
  - src/host/graph-instance.ts
  - src/host/events.ts
  - docs/content/docs/(guide)/time.mdx
  - docs/content/docs/api/timeline.mdx
requires:
  - core
---

# Show a graph through time

Elements carry a `time`, the graph holds a time window, and only elements that exist in the window show. A timeline is a companion that follows the data's time, draws a histogram and moves the window. Load the core skill first (`intent load @bruno00o/graph#core`). Times are numbers (milliseconds since the epoch) or `Date` objects, never strings.

## Core Patterns

### Give elements a time

`time` on `nodes()`, `edges()` and `shapes()` is a channel: a field name or a function of the item. A shape (shapes skill) follows the window like a node, on its own: a shape out of the window is not drawn, picked, lassoed, counted in `count().shown` or exported. The timeline, though, reads nodes and edges only: its extent and histogram ignore the times of shapes. A time is one of:

- a moment, in milliseconds or a `Date`: the element exists at that moment only;
- a period `{ start, end }`: from `start`, included, to `end`, left out. A missing or `null` end leaves it open on that side, so `{ start: date }` exists from `date` on, forever;
- `null`, `undefined`, or any other value (a string, `NaN`, `{}`): no time, the element always shows. A period whose end comes before its start counts as the moment of its start.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string; created: number; closed: number | null }
type Link = { id: string; from: string; to: string; since: Date }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to', time: 'since' }),
    nodes(items, {
      label: 'label',
      time: (item) => ({ start: item.created, end: item.closed }),
    }),
  ],
  time: { fade: 30 * 86_400_000 },
})
```

`time: { fade }` in `defineGraph` is optional (see Fade below).

### Show a time window

Without a window every element shows. A window `{ start, end }` also goes from `start`, included, to `end`, left out, and a missing end leaves it open.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; created: number }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { time: 'created' })] })

const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Sample graph',
  initialTime: { start: new Date(2024, 0, 1), end: new Date(2024, 6, 1) },
})

graph.time.set({ start: Date.UTC(2023, 0, 1), end: Date.UTC(2024, 0, 1) })
graph.time.set({ start: new Date(2024, 0, 1) })
graph.time.set({ start: Date.UTC(2024, 5, 1), end: Date.UTC(2024, 5, 1) })
const current = graph.time.get()
graph.time.set(null)
graph.on('timechange', ({ window }) => console.log(window, current))
```

An element shows when it exists at some moment of the window:

- a period shows when it starts before the window ends and ends after the window starts: a period that ends where the window starts does not show, nor one that starts where the window ends;
- a moment shows from the start of the window, included, to its end, left out;
- a window with `start` equal to `end` is a single moment: it shows what exists then (periods that contain it, moments equal to it);
- an edge shows only when it and both its ends show; an edge without a time follows its ends.

`graph.time.get()` returns the window as numbers (`{ start, end }` with `null` for an open end) or `null`. `time.set` throws a `RangeError` for an end that is not a finite time or a start after the end. Each change emits `timechange` and updates `time` in the store. The window is also set at mount with `initialTime` (uncontrolled).

Hidden elements behave like elements outside a zoom range: not drawn (label, badges and edges on them included), not picked or lassoed, skipped by keyboard focus, not counted by the legend or drawn by the minimap, not wrapped by hulls, and exports draw the current window (or their `window` option). They stay in the data, selection and states. Layouts place every node whatever the window, and `view.fit` still frames them, so nothing moves when the window moves. In a group each node follows its own time; a merged edge exists from the earliest start to the latest end of its members, and has no time when one of them has none.

### Control the window from state

Pass `time` at mount with `onTimeChange`: from then on `graph.time.set` and the timeline only call `onTimeChange`, and only `update({ time })` moves the window. Pass `time: null` for a controlled graph with no window yet: any value other than `undefined` makes it controlled, for its whole life.

```ts
import { defineGraph, mountGraph, nodes, type TimeWindowInput } from '@bruno00o/graph'

type Item = { id: string; created: number }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { time: 'created' })] })

let window: TimeWindowInput | null = null
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Sample graph',
  time: window,
  onTimeChange: (event) => {
    window = event.window
    graph.update({ time: window })
  },
})
```

In React, give `<Graph>` the `time` and `onTimeChange` props from the first render. `<Graph>` hands each request to `onTimeChange` in a microtask and renders the new state before the next frame, so playback stays smooth and a `time.set` from an effect does not make React warn.

```tsx
import { defineGraph, nodes, type TimeWindowInput } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'
import { useState } from 'react'

type Item = { id: string; created: number }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { time: 'created' })] })

export function Controlled() {
  const [window, setWindow] = useState<TimeWindowInput | null>(null)
  return (
    <Graph
      definition={definition}
      ariaLabel="Sample graph"
      style={{ height: 480 }}
      time={window}
      onTimeChange={(event) => setWindow(event.window)}
    />
  )
}
```

### Fade elements at the window edges

By default elements appear and disappear at once. `time: { fade }` in `defineGraph`, in the milliseconds of the data (a finite number, 0 or more, or `defineGraph` throws a `RangeError`), fades elements in after the window reaches them and out before it leaves. With a fade, an element exactly at the edge of the window has faded out and counts as hidden, and a window with `start` equal to `end` shows what exists at that instant only partly faded (a moment exactly at it is hidden): the fade is fixed in `defineGraph`, so leave `fade` at 0 for exact snapshots. The fade multiplies the opacity of the element and of its label, and an edge takes the faintest of its own fade and those of its ends.

### Add a timeline

`createTimeline(graph, options)` follows the time of a graph made by `mountGraph` or `mountMapGraph`, keeps its state in `timeline.store`, and moves the graph's window. `mountTimeline(timeline, options)` renders it in a plain element: a play button, the histogram of nodes and edges over time, the window as a brush with two handles, and ticks.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'

type Item = { id: string; created: number }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { time: 'created' })] }),
  ariaLabel: 'Sample graph',
})

const timeline = createTimeline(graph, { mode: 'slide', loop: true, bins: 80 })
const view = mountTimeline(timeline, {
  ariaLabel: 'Timeline',
  labels: { play: 'Play', start: 'Start of the window', end: 'End of the window', window: 'Window' },
})
document.body.append(view.element)

timeline.brush(new Date(2023, 0, 1), new Date(2023, 3, 1))
timeline.step()
timeline.update({ mode: 'grow', speed: 7 * 86_400_000 })
timeline.play()
```

- Options of `createTimeline`: `bins` (about 80), `ticks` (about 6), `speed` (milliseconds of data time per second; by default the extent in twenty seconds), `mode` (`'slide'` moves both ends and keeps the width, `'grow'` keeps the start and moves the end, so the window gathers everything since the start), `loop` (start again at the end instead of stopping), `extent` (fix one end or both, for instance a whole year or today). `bins`, `ticks` and `speed` must be positive numbers, and `extent` must not start after its end, or `createTimeline` throws a `RangeError`.
- Actions: `set`, `brush(a, b)` (any order), `move(by)`, `nudge(end, count)`, `step(count)`, `clear`, `zoom(factor, at)`, `pan`, `fit`, `play`, `pause`, `toggle`, `update(options)` (an option left out keeps its value, `undefined` resets it to its default), `destroy`.
- `mountTimeline` options: `labels` (accessible names: `play`, `start`, `end`, `window`, and `range(start, end)` for the window's value), `ariaLabel`, `format(time, unit, use)`, `height` (48), `wheel` (zoom and pan the bar), `snap` (ends snap to bins, Alt frees them). Drag across the histogram to brush, drag the window to move it, drag a handle for one end, click to center the window; the handles and the window are sliders (arrows move by a bin, Page Up and Page Down by ten, Home and End to the ends of the extent).
- Bins follow the local calendar (a day, a week starting Monday, a month, a year or a multiple) so the bar holds about `bins` of them. The extent runs from the earliest start to the latest end of the data. Elements without a time are not counted.
- The timeline writes no text of its own: give `labels`, and ticks and values are written by `Intl.DateTimeFormat` in the language of the page (`<html lang>`), or by your `format`.
- Playback stops when the window cannot move further, unless `loop` is on. Destroying the graph destroys its timelines; `timeline.destroy()` leaves the window where it is; `view.destroy()` removes the element only.

For a timeline drawn by your own components, subscribe to `timeline.store` (`extent`, `range`, `bins`, `unit`, `step`, `ticks`, `window`, `playing`, `speed`, `mode`, `loop`) and call the actions:

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { createTimeline } from '@bruno00o/graph/timeline'

type Item = { id: string; created: number }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { time: 'created' })] }),
  ariaLabel: 'Sample graph',
})
const timeline = createTimeline(graph, { loop: true })

const output = document.createElement('output')
const button = document.createElement('button')
button.type = 'button'
button.addEventListener('click', () => timeline.toggle())
timeline.store.subscribe(() => {
  const { bins, window, playing } = timeline.store.get()
  button.textContent = playing ? 'Pause' : 'Play'
  output.textContent = `${bins.length} bins, ${window ? new Date(window.start ?? 0).toISOString() : 'all'}`
})
```

### Use the timeline in React

`<Timeline>` and `useTimeline` come from `@bruno00o/graph/react`. Both read the graph of the `<Graph>` or `<MapGraph>` around them; elsewhere pass it with the `graph` prop or option. `<Timeline>` takes the options of `createTimeline` and `mountTimeline`; `useTimeline` returns `{ state, timeline }` (`timeline` is `null` until the first layout effect) and renders again when the state changes.

```tsx
import { defineGraph, nodes } from '@bruno00o/graph'
import { Graph, Timeline, useTimeline } from '@bruno00o/graph/react'

type Item = { id: string; created: number }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { time: 'created' })] })

function Slider() {
  const { state, timeline } = useTimeline({ mode: 'grow' })
  return (
    <button type="button" onClick={() => timeline?.toggle()}>
      {state.playing ? 'Pause' : 'Play'} ({state.bins.length} bins)
    </button>
  )
}

export function Dated() {
  return (
    <Graph definition={definition} ariaLabel="Dated graph" style={{ height: 480 }}>
      <Timeline loop ariaLabel="Timeline" labels={{ play: 'Play' }} />
      <Slider />
    </Graph>
  )
}
```

Every `<Timeline>` and `useTimeline` creates its own timeline: they share the window (it is the graph's) but not playback, so two controls on one graph do not mirror each other's play state. Use one of them, or keep one `createTimeline` and pass it around.

With `graph: null` the hooks wait for a graph and stay empty. Without a graph from context or the `graph` option, they throw.

### Put a timeline on a map graph

The window works the same on a graph from `mountMapGraph`. In React put `<Timeline>` inside `<MapGraph>`. Without React, create and mount the timeline as above and destroy in reverse order: `view.destroy()`, `timeline.destroy()`, `graph.destroy()`, then `map.remove()`.

## Common Mistakes

### HIGH Giving times as strings

A string such as `'2024-03-01'` is not a time: the element has no time and always shows, and nothing is reported. The field is also refused by the type of the channel when it is a string field. Convert at the source, to milliseconds or a `Date`.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'

type Item = { id: string; created: string }
const items: Item[] = []

nodes(items, { time: 'created' })
```

Write `time: (item) => Date.parse(item.created)`, or store a number.

### HIGH Expecting the end of a period to be inside the window

Ends are exclusive on both the period and the window. A period `{ start: 1, end: 5 }` does not show in the window `{ start: 5 }`, and a moment at 5 does not show in `{ end: 5 }`. To see a snapshot at one instant, use a window with `start` equal to `end`, not a one-millisecond window.

### HIGH Controlling the window without both props

Controlled mode is decided at mount and never changes. `update({ time })` on a graph mounted without `time` does nothing; a graph mounted with `time` (even `null`) ignores `time.set` and the timeline until `update({ time })` or the `time` prop answers. `onTimeChange` that does not apply the window leaves the window frozen and playback stuck.

### MEDIUM A timeline over data with no times

With no element carrying a time, the timeline has no extent (`state.extent` is `null`), no bins, and `play()` does nothing. Give elements a `time`, or fix the bar with the `extent` option. Times on shapes do not count: a graph whose only timed elements are shapes needs the `extent` option, and its histogram stays empty.

### MEDIUM Mixing local and UTC times

Bins, ticks and weeks follow the local time zone, and `new Date(2024, 0, 1)` is local midnight while `Date.UTC(2024, 0, 1)` is UTC midnight. `Date.parse('2023-04-01')` is UTC midnight while a date-time without a zone is local. Store times one way and give the window the same way, or the first bin and the window edges look an hour or a day off.

### MEDIUM Fade in the wrong unit

`time.fade` is in the milliseconds of the data: `30 * 86_400_000` is thirty days when times are in milliseconds, and a huge duration when times are in seconds or years. Use the unit of your times, and expect an element at the very edge of the window to be hidden once a fade is set.

### MEDIUM Expecting the layout to follow the window

A hidden element keeps its place: layouts position every node whatever the window, and `view.fit` frames hidden nodes too. The graph does not rearrange when the window moves. To lay out only what exists at a time, build the data for that window instead of using a window.

### MEDIUM A timeline outside `<Graph>` without a graph

`<Timeline>` and `useTimeline` read the graph from context. Rendered elsewhere, they throw: pass `graph`, or `graph: null` while it is not there yet. A timeline created on a destroyed graph comes back destroyed, and one on a graph not made by `mountGraph` or `mountMapGraph` throws an `Error`.

## Completion

The task is done when:

- every element that should be dated has a number, `Date`, or `{ start, end }` time, and no time is a string;
- the window is set with `initialTime`, `graph.time.set`, a timeline, or the controlled `time` and `onTimeChange` pair, answered with `update({ time })`;
- period and window ends follow the exclusive end rule, and snapshots use `start` equal to `end`;
- the timeline is created after the graph, mounted somewhere with a size, and destroyed with its graph (or before it, in reverse order);
- the page language or `format` and `labels` give readable ticks and accessible names;
- `tsc` accepts the code with no cast.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Time](https://bruno00o.github.io/graph/docs/time), [createTimeline and mountTimeline](https://bruno00o.github.io/graph/docs/api/timeline), [nodes](https://bruno00o.github.io/graph/docs/api/nodes), [edges](https://bruno00o.github.io/graph/docs/api/edges)
- Examples: [the time window](https://bruno00o.github.io/graph/examples/time), [moments and periods](https://bruno00o.github.io/graph/examples/time-moments), [graph that grows](https://bruno00o.github.io/graph/examples/time-growth), [time slider of your own](https://bruno00o.github.io/graph/examples/time-slider), [map in time](https://bruno00o.github.io/graph/examples/map-time-window)
- Showing elements by zoom instead of time is in the view skill; both combine, an element shows when its zoom range and the window let it.
