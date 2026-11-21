# Count events of the application, and move a moment

`events` gives the bar something other than the graph to count: a log of what changed and when, as one histogram stacked by kind. Each event is a moment and a kind, read by `eventTime` and `eventKind` (field names or functions; defaults `time` and `kind`). `instant: true` makes the window a single moment, a cursor, so the graph shows what exists at that moment.

```ts
import type { GraphInstance } from '@bruno00o/graph'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'

type Change = { at: Date; type: 'added' | 'changed' | 'removed'; key: string }
declare const changes: Change[]
declare const graphs: GraphInstance[]

const timeline = createTimeline({
  events: changes,
  eventTime: 'at',
  eventKind: 'type',
  kinds: ['added', 'changed', 'removed'],
  instant: true,
})
const view = mountTimeline(timeline, {
  ariaLabel: 'Changes',
  labels: { play: 'Play', cursor: 'Moment', kinds: 'Kinds of change' },
  kindText: (kind) => kind,
})
document.body.append(view.element)

timeline.store.subscribe(() => {
  const { window } = timeline.store.get()
  for (const graph of graphs) graph.time.set(window)
})
timeline.stepEvent()
const window = timeline.store.get().window
const made = window?.start == null ? [] : timeline.events(window.start)
```

- With a graph (`createTimeline(graph, { events })`) the timeline moves that graph's window; without one (`createTimeline({ events })`) it keeps the window in its own state, for you to apply to any graphs or none. The extent comes from the first and last event, and `bin.events` and `bin.kinds` count them while `bin.nodes` and `bin.edges` still count the graph.
- Kinds stack in the order of `kinds`, then in the order events first give them, colored `--graph-cat-1` to `-12` or by `kindColors`. `state.kinds` lists them with color, count and `hidden`. `toggleKind(kind)` hides or shows one; `hiddenKinds` sets them only when the option changes. The bar shows a button for each kind when there are two or more (`legend: false` removes them, `kindText` writes their text, `labels.kinds` names the group).
- `stepEvent(count?)` goes to the next event (back when negative), skipping hidden kinds and counting events at one moment once; with `instant` the cursor lands on it, otherwise the end of the window lands 1 ms after it (with no window yet, it starts from the beginning of the extent, at the first event). In the bar, Shift with the arrow keys does the same, and the cursor is a slider (`labels.cursor`) that snaps to the bins unless Alt is held.
- `timeline.events(moment)` returns the events made at that moment, `events(a, b)` those from `a` included to `b` left out, in time order, for a panel of details. An event without a valid moment is left out, one without a kind belongs to `''`.
- A new `events` array counts again at once; one that starts with the objects of the previous array (a log that grows) only reads the additions. Pass the `data` of a live query as it comes. It never changes the array in place.
