# History: scales, legend, React and costs

The journal behind `history` is read once and indexed by element. This page covers what the main skill leaves out: what the scales and the legend do with it, how entries that arrive later behave, entries that say when an element is there, how to keep it stable in React, and what it costs.

## Scales cover the whole journal

A mark with a `history` gives its scales every value its elements take over the whole journal, not those of the moment, so a step of the cursor never rescales or rewrites elements it does not cross.

- A numeric scale (`size`, `width`, a sequential `color`, and the width and color of edge ends) spans the smallest and largest value of the journal.
- A categorical color lists, in this order, the values of `domain`, the values of the items, then the values of the entries by the date of their first appearance (an exact tie goes to the entry that arrived first). Colors are the same whatever moment is shown first.
- Entries from a live source extend the scales: a new value takes the next color and no other changes.
- Aggregated edges, folded groups and group containers read the values of the moment and do not enter the scales.
- Marks without a history keep scales on their current values.
- There is no option to read the moment only: it would rewrite every element at each step. To bound a scale, give it a `domain`.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'

type Item = { id: string; level: number }
type Change = { key: string; time: number; values: { level: number } }
declare const items: Item[]
declare const changes: Change[]

const history = historyFrom(changes)

export const definition = defineGraph({
  marks: [nodes(items, { size: 'level', history })],
  scales: { size: { domain: [0, 10], range: [8, 32] } },
})
```

## The legend

The legend lists the categories of the whole journal and counts the elements drawn at the moment, so a value that no element shows now has a count of zero. A `domain` value with no element does the same. `createLegend(graph, { empty: 'hide' })` (also `<Legend empty="hide" />` and `useLegend({ empty: 'hide' })`) leaves them out, `'show'` is the default. Code that reads `legend.store.state` must not assume that a listed category has a count above zero, as when it divides by it or picks the first nonzero one.

## Entries that arrive later

A live source of entries (a TanStack DB collection) is followed: inserts, updates and deletes apply at the next frame and count in `data.loading`, `graph.loaded()` and `waitForData`. An entry later than the cursor still folds into the scales, so a late entry may extend them without moving the cursor. An invalid entry (no key, a time that is not valid, `values` that is not an object) is ignored with one warning per history in development, and nothing goes to `issues()`.

## When elements are there

An entry with `present: true` or `false` (or the field or function named by the `present` option) says whether its element is there from its moment on. The journal then gives each element periods of presence, read from every entry whatever the window, like a list of periods in `time`:

```ts
import { edges } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'

type Link = { id: string; from: string; to: string }
type Opening = { id: string; time: Date; link: string; open: boolean }
declare const links: Link[]
declare const openings: Opening[]

const history = historyFrom(openings, { key: 'link', present: 'open' })
export const roads = edges(links, { source: 'from', target: 'to', history })
```

- The first `true` of an element means it was not there before, the first `false` that it was; after its last entry it stays as that entry left it. An element without any presence keeps the `time` of its mark.
- The element exists when both its presence and the `time` of its mark say so. It always reads as a copy of its item, and `graph.history.of` lists `present` on these entries.
- An entry may give values and a presence. An entry with a presence needs no values; one with neither (no presence, `values` not an object) is ignored.
- A journal of presences only must name `present`, even when the field is called `present`: the default reading expects `values` in every entry, and no form of `historyFrom` matches. With `present` named it returns a `HistorySource<NoValues>`.

```ts expect-error=TS2769
import { historyFrom } from '@bruno00o/graph/history'

type Seen = { key: string; time: number; present: boolean }
declare const seen: Seen[]

historyFrom(seen)
```

Write `historyFrom(seen, { present: 'present' })`.

## React

Make the history once and share it with every render:

```tsx
import { defineGraph, nodes } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'
import { Graph, useGraphState } from '@bruno00o/graph/react'
import { useMemo } from 'react'

type Item = { id: string; state: string }
type Change = { key: string; time: number; values: { state: string } }
declare const items: Item[]

function Moment() {
  const window = useGraphState((state) => state.time)
  return <output>{window?.end ?? 'latest'}</output>
}

export function Replay({ changes }: { changes: Change[] }) {
  const definition = useMemo(
    () => defineGraph({ marks: [nodes(items, { color: 'state', history: historyFrom(changes) })] }),
    [changes],
  )
  return (
    <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }}>
      <Moment />
    </Graph>
  )
}
```

`graph.history.of` and `history.instant()` read the instance, so call them in an event handler or an effect with the instance from the `ref` of `<Graph>` or the `graph` option of the hooks, not while rendering (they apply pending data, which notifies the store). To follow the moment in a component, read `time` from the store with `useGraphState` as above; the values are read at the end of that window.

## Costs

Measured at 100,000 nodes and 200,000 edges with 1,000,000 entries over 30 days on the nodes:

| Step | Time |
| --- | --- |
| Reading the entries, on top of mounting | 140 to 165 ms |
| Scales over the journal, on top of the first frame | 210 to 260 ms |
| Memory | about 40 bytes per entry, plus about 90 per element for its scales and steps |
| A step of one hour (about 1,400 entries) | 4.5 to 5.5 ms of work, 20 ms per frame |
| A step of one day (about 33,000 entries) | 32 to 38 ms |
| A jump of 20 days, every node read again | 155 to 175 ms |
| Without a history, any step | under 0.2 ms |

When only the moment moves, a step writes the elements it crosses straight to their records. A step where the items, the marks or the journal change at the same time takes the full path, by key, and costs more. A history made again at each render is indexed again (400 to 560 ms at this size) and reads the elements of both again.
