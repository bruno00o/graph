---
name: time
description: >
  Use when giving @bruno00o/graph nodes, edges and shapes a time, a period or
  several periods, showing only what exists in a time window, fading elements
  in and out at the edges of the window, controlling the window from
  application state, or adding a timeline with a histogram that brushes, steps
  and plays (default element, a renderer of your own, or the React Timeline
  component and useTimeline hook), counting the events of the application on
  the bar, moving a single moment instead of a window, a timeline that follows
  no graph, giving elements values that change over time from a journal of
  changes (the history option and historyFrom, a color, size or label that
  follows the cursor, elements that come and go), also on a map graph.
metadata:
  purpose: >
    Time in @bruno00o/graph: the time channel of nodes, edges and shapes, the time
    window and its exact boundaries, the fade, the controlled window, the
    timeline companion with its store and actions, events of the application and
    a moment as cursor, values that change over time from a journal of changes
    (history, scales over the whole journal), and the mistakes that leave
    everything showing, nothing playing or a window one moment off.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/timeline/index.ts
  - src/timeline/view.ts
  - src/timeline/events.ts
  - src/core/time-range.ts
  - src/react/index.tsx
  - src/types.ts
  - src/host/graph-instance.ts
  - src/host/events.ts
  - src/history/index.ts
  - src/core/history.ts
  - src/core/periods.ts
  - src/history/presence.ts
  - docs/content/docs/(guide)/time.mdx
  - docs/content/docs/api/timeline.mdx
  - docs/content/docs/api/history.mdx
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
- a list of moments and periods, an array or any iterable: the element exists in each of them and is hidden between them (see [Give elements several periods](#give-elements-several-periods)). An empty list means it never exists;
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

### Give elements several periods

An element that comes and goes takes a list:

```ts
import { nodes } from '@bruno00o/graph'

type Stay = { from: Date; to: Date | null }
type Item = { id: string; stays: Stay[] }
declare const items: Item[]

const visits = nodes(items, {
  time: (item) => item.stays.map((stay) => ({ start: stay.from, end: stay.to })),
})
```

- Periods that overlap or touch merge, so `[{ start: 1, end: 5 }, { start: 5, end: 9 }]` is one period from 1 to 9, and a moment inside a period merges into it. The element shows when one of its periods meets the window. With a fade it takes the fade of the period that goes deepest into the window.
- An edge exists where its own periods meet those of both ends. A merged edge spans from the earliest start to the latest end of its members, so it also shows in their common gaps.
- The timeline counts an element once in a bin that two of its periods meet, and leaves out its gaps.
- A journal can give the periods instead, with entries that say when an element is there (`present`, see below).
- At 100,000 nodes and 200,000 edges, three periods per node against one: first frame 370 to 375 ms (300 to 310), a frame while playing 4.8 to 5.8 ms (3.4 to 4.5), first histogram 134 to 140 ms (43 to 48).

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

`createTimeline(graph, options)` follows the time of a graph made by `mountGraph` or `mountMapGraph` (on its canvas or on a map), keeps its state in `timeline.store`, and moves the graph's window. `mountTimeline(timeline, options)` renders it in a plain element: a play button, the histogram of nodes and edges over time, the window as a brush with two handles, and ticks.

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

### Count events of the application, and move a moment

`createTimeline(graph, { events })` counts a log of what changed and when, read by `eventTime` and `eventKind` (defaults `time` and `kind`), as one histogram stacked by kind (`bin.events`, `bin.kinds`, `state.kinds`, `toggleKind`). `instant: true` makes the window a single moment, a cursor. Without a graph (`createTimeline({ events })`, `graph: false` in React) the timeline keeps the window in its own state, for you to apply to any graphs. `stepEvent(count?)` goes to the next event (Shift and the arrows in the bar), `timeline.events(moment)` or `events(a, b)` lists the events for a panel, and a new array that starts with the objects of the previous one only reads the additions. Recipe and details: [references/events.md](references/events.md).

### Give elements values that change over time

`time` says when an element exists; a history says what its fields are at each moment. A journal of changes, each a key, a moment and values, goes through `historyFrom` (`@bruno00o/graph/history`) into the `history` option of `nodes()`, `edges()` or `shapes()` (not `groups()`). The graph then reads each element as its item plus the values of the entries up to the end of the window, and the same journal can drive the bar.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'
import { createTimeline } from '@bruno00o/graph/timeline'

type Item = { id: string; state: 'idle' | 'active'; level: number }
type Change = {
  time: Date
  kind: 'state' | 'level'
  node: string
  state?: Item['state']
  level?: number
}

declare const items: Item[]
declare const changes: Change[]

const history = historyFrom(changes, {
  key: 'node',
  values: (change) => ({ state: change.state, level: change.level }),
})

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { color: 'state', size: 'level', history })] }),
  ariaLabel: 'Sample graph',
})
const timeline = createTimeline(graph, { events: changes, eventKind: 'kind', instant: true })
timeline.stepEvent()
```

- Entries are read as `{ key, time, values }` by default; the `key`, `time` and `values` options read other shapes (a field name or a function; `values` also a function that returns the fields). `data` is an array or a live source. A value that does not fit the item (a field it lacks, another type) is refused by the types.
- The values are read at the end of the window: with a single-moment window (`instant: true`) the entries at that moment count, with a period only those before its end (the end is left out), and without a window or with an open end every entry counts, so the elements show their latest values.
- Entries apply in time order, then in arrival order. A field set to `undefined` keeps its value, `null` sets it to `null`, and the fields named by the `key` and `time` options of the mark never change. Any other field can: label, color, the ends of an edge, the parent of a node, a position, the geometry of a shape.
- `datumOf`, event targets, the accessors of the mark, the legend, paths and exports receive a copy of the item with the values applied (same prototype, frozen when the item is), a new object whenever an entry applies; an element with no entry before the moment keeps the item itself. Do not compare data by identity across moments.
- `graph.history.of({ kind, key })` lists every entry of an element, before and after the moment, sorted, `time` in milliseconds; `graph.history.instant()` is the moment the values are read at (`Infinity` without window). Both apply pending data first.
- An entry can also say whether its element is there from its moment on: `true` or `false` in its `present` field, or in the field or function of the `present` option. These entries make periods over the whole journal, whatever the window: the first `true` means the element was not there before, the first `false` that it was. The element shows when both these periods and the `time` of its mark say it exists, and always reads as a copy. A journal of presences only names `present`: see [references/history.md](references/history.md#when-elements-are-there).
- A live source of entries, such as a TanStack DB collection, is followed, and its `status` counts in `data.loading`, `loaded()` and `waitForData`.
- The scales over the whole journal, the legend, entries that arrive later, protected fields, React and costs are in [references/history.md](references/history.md).

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

Every `<Timeline>` and `useTimeline` creates its own timeline: they share the window (it is the graph's) but not playback, so two controls on one graph do not mirror each other's play state. To draw the timeline that `useTimeline` made and read it too, pass it to `<Timeline timeline={timeline} />` (`null` renders nothing yet): one timeline, one play state.

With `graph: null` the hooks wait for a graph and stay empty. With `graph: false` they follow no graph and count `events`, keeping the window in their state (`useTimeline({ graph: false, events })`). Without a graph from context or the `graph` option, they throw.

### Put a timeline on a map graph

The window works the same on a graph from `mountMapGraph`, and on one that moves between its canvas and a map: the timeline keeps following it. In React put `<Timeline>` inside `<MapGraph>` or `<Graph>`. Without React, create and mount the timeline as above and destroy in reverse order: `view.destroy()`, `timeline.destroy()`, `graph.destroy()`, then `map.remove()`.

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

### HIGH An empty list where no time was meant

`time: (item) => item.stays.map(...)` returns `[]` for an item without stays, and an empty list means the element never exists: no window shows it, and nothing is reported. Return `null` when the element should always show: `item.stays.length > 0 ? item.stays.map(...) : null`.

### MEDIUM One period from the first start to the last end

An element that comes and goes, given `{ start: first, end: last }`, shows in every gap between its stays, and the histogram counts it there. Give the list of its periods. A GEXF file gives them as `spells` (file-formats skill).

### HIGH Expecting the end of a period to be inside the window

Ends are exclusive on both the period and the window. A period `{ start: 1, end: 5 }` does not show in the window `{ start: 5 }`, and a moment at 5 does not show in `{ end: 5 }`. To see a snapshot at one instant, use a window with `start` equal to `end`, not a one-millisecond window.

### HIGH Controlling the window without both props

Controlled mode is decided at mount and never changes. `update({ time })` on a graph mounted without `time` does nothing; a graph mounted with `time` (even `null`) ignores `time.set` and the timeline until `update({ time })` or the `time` prop answers. `onTimeChange` that does not apply the window leaves the window frozen and playback stuck.

### HIGH Building the history in render

`historyFrom(changes, …)` makes an object that the graph keeps its index on. One built again at every render, or in a definition function called at every update, is a new history: the journal is indexed again and every element reads again. Make it once, at module level or in `useMemo` keyed on the entries (the react skill), and give the same object to each definition. Pass a live source or a new array only when the entries change.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'

type Item = { id: string; state: string }
type Change = { key: string; time: number; values: { state: string } }
declare const items: Item[]

export function definitionOf(changes: Change[]) {
  return defineGraph({ marks: [nodes(items, { color: 'state', history: historyFrom(changes) })] })
}
```

Build `const history = historyFrom(changes)` once, outside, and use `{ history }`.

### MEDIUM Rebuilding `events` or its readers in render

`useTimeline({ events: log.map(toEvent), eventTime: (event) => event.at })` in a component makes a new array of new objects and a new function on every render, so the timeline counts every event again each time. Keep the array in state or `useMemo` (a growing log whose array starts with the same objects only reads the additions), give a field name to `eventTime` and `eventKind`, or declare the functions outside the component.

### MEDIUM `graph: null` where `graph: false` was meant

`graph: null` waits for a graph: the state stays empty and `timeline` stays `null` until one is given, so a timeline of `events` never counts. `graph: false` is a timeline without a graph. Leaving `graph` out outside `<Graph>` and `<MapGraph>` throws.

### MEDIUM A timeline over data with no times

With no element carrying a time and no `events`, the timeline has no extent (`state.extent` is `null`), no bins, and `play()` does nothing. Give elements a `time`, or fix the bar with the `extent` option. Times on shapes do not count: a graph whose only timed elements are shapes needs the `extent` option, and its histogram stays empty.

### MEDIUM `history` on `groups()`

A group has no history: `groups()` refuses the option. Give the history to the `nodes()` mark whose items the groups gather; an aggregated edge or a group container reads the values of the moment and takes no part in the scales of the journal.

```ts expect-error=TS2353
import { groups } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'

type Item = { id: string; state: string }
type Change = { key: string; time: number; values: { state: string } }
declare const items: Item[]
declare const changes: Change[]

groups(items, { by: 'state', history: historyFrom(changes) })
```

### MEDIUM A `history` that `historyFrom` did not make

`history` accepts only what `historyFrom` returns, but the type is open: an object typed by hand compiles, and `defineGraph` throws a `TypeError` ("the history option of a mark must come from historyFrom()"). Keep the object that `historyFrom` returns, and do not copy or spread it.

```ts
import { defineGraph, type HistorySource, type HistoryValues, nodes } from '@bruno00o/graph'

type Item = { id: string; state: string }
declare const items: Item[]

const history: HistorySource<HistoryValues<Item>> = {}

export const definition = defineGraph({ marks: [nodes(items, { color: 'state', history })] })
```

### MEDIUM Expecting the scales to follow the moment

The scales of a mark with a history cover every value of the whole journal, so the cursor never rescales anything: a sequential color or a size spans the smallest and largest value ever taken, and a category keeps the color of its first appearance. A graph that shows only small values at the moment looks compressed, and there is no option to read the values of the moment alone (it would rewrite every element at each step). Set `scales.size` or `scales.color` with a `domain` to fix the bounds yourself.

### MEDIUM A wide jump over a large journal

A step reads again only the elements whose entries it crosses, so one change at a time costs almost nothing, but a jump (a brush over weeks, a window set far away, `time.set(null)`) reads every element it crosses: 155 to 175 ms at 100,000 nodes and 1,000,000 entries. A step where the items, the marks or the journal change too takes the slower full path. Step by bins or by event, keep the window moving in small steps while it plays, and expect one slow frame when the cursor leaps.

### MEDIUM Mixing local and UTC times

Bins, ticks and weeks follow the local time zone, and `new Date(2024, 0, 1)` is local midnight while `Date.UTC(2024, 0, 1)` is UTC midnight. `Date.parse('2023-04-01')` is UTC midnight while a date-time without a zone is local. Store times one way and give the window the same way, or the first bin and the window edges look an hour or a day off.

### MEDIUM Fade in the wrong unit

`time.fade` is in the milliseconds of the data: `30 * 86_400_000` is thirty days when times are in milliseconds, and a huge duration when times are in seconds or years. Use the unit of your times, and expect an element at the very edge of the window to be hidden once a fade is set.

### MEDIUM Expecting the layout to follow the window

A hidden element keeps its place: layouts position every node whatever the window, and `view.fit` frames hidden nodes too. The graph does not rearrange when the window moves. To lay out only what exists at a time, build the data for that window instead of using a window.

### MEDIUM A timeline outside `<Graph>` without a graph

`<Timeline>` and `useTimeline` read the graph from context. Rendered elsewhere, they throw: pass `graph`, `graph: null` while it is not there yet, or `graph: false` for a timeline of events. A timeline created on a destroyed graph comes back destroyed, and one on a graph not made by `mountGraph` or `mountMapGraph` throws an `Error`.

## Completion

The task is done when:

- every element that should be dated has a number, `Date`, `{ start, end }` time or a list of them, no time is a string, and an element with no period returns `null`, not `[]`;
- the window is set with `initialTime`, `graph.time.set`, a timeline, or the controlled `time` and `onTimeChange` pair, answered with `update({ time })`;
- period and window ends follow the exclusive end rule, and snapshots use `start` equal to `end`;
- the timeline is created after the graph, mounted somewhere with a size, and destroyed with its graph (or before it, in reverse order);
- a timeline of events is made with `graph: false` or no graph, with stable `events` and readers;
- a journal of changes goes through one `historyFrom` made once, and the same entries feed the bar and the graph;
- the page language or `format` and `labels` give readable ticks and accessible names;
- `tsc` accepts the code with no cast.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Time](https://bruno00o.github.io/graph/docs/time), [several periods](https://bruno00o.github.io/graph/docs/time#several-periods), [events](https://bruno00o.github.io/graph/docs/time#events), [values over time](https://bruno00o.github.io/graph/docs/time#values-over-time), [historyFrom](https://bruno00o.github.io/graph/docs/api/history), [createTimeline and mountTimeline](https://bruno00o.github.io/graph/docs/api/timeline), [nodes](https://bruno00o.github.io/graph/docs/api/nodes), [edges](https://bruno00o.github.io/graph/docs/api/edges)
- Examples: [the time window](https://bruno00o.github.io/graph/examples/time), [moments and periods](https://bruno00o.github.io/graph/examples/time-moments), [graph that grows](https://bruno00o.github.io/graph/examples/time-growth), [time slider of your own](https://bruno00o.github.io/graph/examples/time-slider), [map in time](https://bruno00o.github.io/graph/examples/map-time-window), [history of changes](https://bruno00o.github.io/graph/examples/change-history), [values over time](https://bruno00o.github.io/graph/examples/values-over-time), [several periods](https://bruno00o.github.io/graph/examples/several-periods)
- Showing elements by zoom instead of time is in the view skill; both combine, an element shows when its zoom range and the window let it.
