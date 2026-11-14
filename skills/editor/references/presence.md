# Show who else is editing

`showPresence(graph, options)` from `@bruno00o/graph/db` shows the other people working on the same graph: a cursor at the pointer of each, and their selections in free states. It works on any graph, with or without a shape editor. The library sends nothing: you give it a TanStack DB collection with one row per person, and your collection carries the rows between clients (its handlers, a sync engine, local storage).

```ts
import { defineGraph, mountGraph, nodes, type Point, type StateKindStyles } from '@bruno00o/graph'
import { type PresenceSelection, showPresence } from '@bruno00o/graph/db'
import type { Collection } from '@tanstack/db'

type Item = { id: string; x: number; y: number }
type Seen = {
  id: string
  name: string
  pointer: Point | null
  selection: PresenceSelection | null
  time: number
}

declare const items: Item[]
declare const crowd: Collection<Seen, string>
declare const me: string
declare const myName: string

const look = (color: string): StateKindStyles => ({
  nodes: { outline: color, outlineWidth: 3 },
  shapes: { stroke: color, strokeWidth: 4 },
})

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [nodes(items, { x: 'x', y: 'y' })],
    states: {
      presence1: look('var(--graph-cat-1)'),
      presence2: look('var(--graph-cat-2)'),
      presence3: look('var(--graph-cat-3)'),
    },
  }),
  ariaLabel: 'Shared graph',
})

const presence = showPresence(graph, {
  collection: crowd,
  me,
  create: (id, values) => ({ id, name: myName, ...values }),
})
presence.store.subscribe(() => console.log(presence.store.state.length))
presence.stop()
```

- A row holds `pointer` (world units, `null` off the graph), `selection` (`{ nodes, edges, shapes }` keys, or `null`) and `time` (milliseconds since the epoch); `fields` renames them. `create` is required: it builds the row of the local person the first time, with the three values and your own fields, such as a name. `me` is its key.
- Selections show in the free states `presence1` to `presence8` that the definition declares, or in the list given in `states` (every name must be a free state, or it throws). A person takes the least used slot and keeps it while present; beyond the number of states, people share them. With no state declared, only cursors show. A state with `outline` styles nodes; give shapes a `stroke` through a style by kind, as above. These states belong to `showPresence`: do not set them yourself.
- Cursors are anchored elements at a point: a colored dot without text by default (`var(--graph-cat-N)` for slot N, or `colors`), a function `cursor(participant)` for your own element, made once per person, or `cursor: false`. They follow the pointer on a flat map and on the globe and hide behind its horizon.
- Pointers are in world units: two clients show a cursor at the same place only when their elements have the same positions (positions in the data, a map, a layout that does not depend on the client).
- The local row is written at most every `wait` ms (50), a slow write delaying the next by four times its cost, and rewritten every third of `expire` (30,000 ms) while idle. Rows older than `expire`, on the clock of this client, no longer count. Selections are cut to `maxSelection` keys per kind (500).
- `presence.store` lists the other people (`id`, `slot`, `state`) and changes only when one joins or leaves. `presence.stop()`, destroying the graph or closing the page removes the local row, the cursors and the states.
- The library never deletes the rows of others: rows of tabs closed abruptly stay in the collection, ignored once expired. To clean them yourself, skip the call when the list is empty: `collection.delete([])` throws (`No keys were passed to delete`).
- A shape another person moves or draws is not previewed apart: with `persistShapes` and `live`, moved shapes already move on every screen, and a new shape appears when its author ends it.

In React, start it in an effect once the graph exists, and stop it in the cleanup:

```tsx
import type { GraphInstance, Point } from '@bruno00o/graph'
import { type PresenceSelection, showPresence } from '@bruno00o/graph/db'
import type { Collection } from '@tanstack/db'
import { useEffect } from 'react'

type Seen = { id: string; pointer: Point | null; selection: PresenceSelection | null; time: number }
type Props = { graph: GraphInstance | null; crowd: Collection<Seen, string>; me: string }

export function Presence({ graph, crowd, me }: Props) {
  useEffect(() => {
    if (!graph) return
    const shown = showPresence(graph, {
      collection: crowd,
      me,
      create: (id, values) => ({ id, ...values }),
    })
    return () => shown.stop()
  }, [graph, crowd, me])
  return null
}
```
