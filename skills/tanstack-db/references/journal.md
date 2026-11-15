# Read a journal of changes from a collection

A collection of changes, one row per change with the key of an element, a moment and the fields it sets, becomes the `history` of a mark. The nodes then read as their items plus the values of the rows up to the end of the time window (time skill).

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'

type Item = { id: string; state: 'idle' | 'active' }
type Change = { id: string; time: number; node: string; state: Item['state'] }

declare const items: Item[]

const changes = createCollection(
  localOnlyCollectionOptions({ getKey: (change: Change) => change.id, initialData: [] }),
)
const history = historyFrom(changes, {
  key: 'node',
  values: (change) => ({ state: change.state }),
})

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { color: 'state', history })] }),
  ariaLabel: 'Journal graph',
})

changes.insert({ id: 'c1', time: Date.now(), node: 'a', state: 'active' })
```

- Inserts, updates and deletes of the collection apply at the next frame: a new row changes the elements it names from its moment on, a delete takes its values back, and the scales of the journal extend for a new value without moving the others.
- The status of the collection counts like that of a mark: `data.loading`, `await graph.loaded()` and `waitForData` wait for the journal too, so the first layout and fit wait for the first entries.
- Make the `historyFrom` call once and keep it across definitions; a new call at each render indexes the journal again.
