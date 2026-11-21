# Save shape edits to a collection

`persistShapes(editor, options)` from `@bruno00o/graph/db` listens to the `edit` event of a shape editor and writes each edit into a TanStack DB collection, the one the shape mark draws from. It returns `{ stop }`, whose `stop()` stops writing. Install `@tanstack/db` yourself (tanstack-db skill).

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { persistShapes } from '@bruno00o/graph/db'
import { createShapeEditor, mountShapeEditor } from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'

type Zone = { id: string; tone: string; order: number; geometry: ShapeGeometry }

const zones = createCollection(
  localOnlyCollectionOptions({ getKey: (zone: Zone) => zone.id, initialData: [] }),
)

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [shapes(zones, { name: 'zones', color: 'tone', order: 'order' })],
    states: { saving: { opacity: 0.6 } },
  }),
  ariaLabel: 'Zones',
})

const editor = createShapeEditor(graph)
mountShapeEditor(editor)

const { stop } = persistShapes(editor, {
  collection: zones,
  create: (edit) => ({
    id: String(edit.key),
    tone: edit.datum?.tone ?? 'new',
    order: edit.datum?.order ?? 0,
    geometry: edit.geometry,
  }),
  live: true,
  pendingState: 'saving',
})
editor.on('editlost', ({ edits }) => console.log('not saved', edits.length))
```

- A change assigns only the fields it changes (`geometry`, `order` from `raise` and `lower`, `text`), so `transaction.mutations[i].changes` holds the outline alone and a server that merges fields keeps the others. `fields` renames them, `key` maps a shape key to a row key, `mark` keeps to one mark.
- A removal deletes the row. A new shape, drawn or copied, needs `create`, which builds its whole row from the edit (`edit.datum` is the copied item for a copy, `edit.text` the text of a text box). Without `create`, only the undo of a removal is inserted again; other new shapes wait, then `editlost`.
- A row of a collection carries the virtual properties of TanStack DB (`$key`, `$origin` and others) in `datum`: pick the fields you need in `create` instead of spreading `datum`.
- The write is optimistic: the collection changes at once and the wait of the editor ends in the next frame. Any change of the row ends it, so a server that rounds points does not leave the shape waiting. An edit whose row already holds it answers at once.
- Without `mutationFn`, the collection persists through its own handlers. With `mutationFn`, `createPacedMutations` calls it at the pace of `strategy` (100 ms throttle by default); a rejected mutation rolls the rows back, then the editor emits `editlost` with the edits it carried.
- `pendingState` names a free state declared in the definition, held by each shape from its write until it is done or has failed. The editor carries the state names of its graph: with a typed graph, another name does not compile; with an untyped one, it throws.
- `live: true` writes the shapes of a gesture every 100 ms while it runs (a number sets the period), then the release at once. A slow write delays the next one by four times its cost. A cancelled gesture (Escape, a second finger, `editor.cancel()`) writes the shapes back as they were. Each write is read again by every client: keep `live` for a few shapes at a time (1,000 shapes moved together drop frames).
- The last writer wins, shape by shape, with no merge of points. A change from elsewhere does not stop your gesture, and your release writes over it; a removal from elsewhere ends your gesture.
- An edit whose row is not in the collection is skipped, so two `persistShapes` on two collections keep to their own rows. Writes that come from elsewhere never go back out.

With several shape marks, give each its own collection and its own `persistShapes`, each with its `mark`. `mark` skips the edits of other marks at run time and types `create`: it receives the new shapes of the marks of that name only, with the `datum` type of their items, so no narrowing is needed.

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { persistShapes } from '@bruno00o/graph/db'
import { createShapeEditor } from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'

type Zone = { id: string; tone: string; geometry: ShapeGeometry }
type Note = { id: string; text: string; geometry: ShapeGeometry }

const zones = createCollection(
  localOnlyCollectionOptions({ getKey: (zone: Zone) => zone.id, initialData: [] }),
)
const notes = createCollection(
  localOnlyCollectionOptions({ getKey: (note: Note) => note.id, initialData: [] }),
)

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [shapes(zones, { name: 'zones' }), shapes(notes, { name: 'notes', label: 'text' })],
  }),
  ariaLabel: 'Plan',
})
const editor = createShapeEditor(graph)

persistShapes(editor, {
  collection: zones,
  mark: 'zones',
  create: (edit) => ({
    id: String(edit.key),
    tone: edit.datum?.tone ?? 'new',
    geometry: edit.geometry,
  }),
})
persistShapes(editor, {
  collection: notes,
  mark: 'notes',
  create: (edit) => ({ id: String(edit.key), text: edit.text ?? '', geometry: edit.geometry }),
})
```

With `exactOptionalPropertyTypes` in your `tsconfig`, set `skipLibCheck: true`: the declaration files of `@tanstack/db` do not pass that option, whatever your own code does.

To share the shapes between tabs or windows, give the collection `localStorageCollectionOptions({ id, storageKey, getKey })` from `@tanstack/db` instead of `localOnlyCollectionOptions`: tabs on the same origin see each other's writes through the `storage` event, and `persistShapes` and `showPresence` need nothing else. A sync engine or the handlers of your own collection work the same way.

In React, call it from an effect once the editor exists, and return its `stop` method:

```tsx
import type { ShapeGeometry } from '@bruno00o/graph'
import { persistShapes } from '@bruno00o/graph/db'
import { useShapeEditor } from '@bruno00o/graph/editor/react'
import type { Collection } from '@tanstack/db'
import { useEffect } from 'react'

type Zone = { id: string; geometry: ShapeGeometry }

export function SavedShapes({ zones }: { zones: Collection<Zone, string> }) {
  const { editor } = useShapeEditor()
  useEffect(
    () =>
      editor
        ? persistShapes(editor, {
            collection: zones,
            create: (edit) => ({ id: String(edit.key), geometry: edit.geometry }),
          }).stop
        : undefined,
    [editor, zones],
  )
  return null
}
```

## Writing edits by hand

To write the edits yourself, with `collection.update` in `onEdit`, write every field an edit carries (`geometry`, `order`, `text`), insert the rows of `'add'` edits and delete the rows of `'remove'` edits. The geometry an editor hands out is a `WritableShapeGeometry`: a fresh copy, writable all the way down, that assigns to the draft of TanStack DB with no cast. Let `onEdit` infer the type of the edits:

```ts
import type { GraphInstance, ShapeGeometry } from '@bruno00o/graph'
import { createShapeEditor } from '@bruno00o/graph/editor'
import type { Collection } from '@tanstack/db'

type Zone = { id: string; geometry: ShapeGeometry }
declare const zones: Collection<Zone, string>
declare const graph: GraphInstance

createShapeEditor(graph, {
  onEdit(edits) {
    for (const edit of edits) {
      if (edit.type !== 'change' || edit.geometry === undefined) continue
      const geometry = edit.geometry
      zones.update(String(edit.key), (draft) => {
        draft.geometry = geometry
      })
    }
  },
})
```

Annotating a parameter as `ShapeEdit` keeps its geometry a read-only `ShapeGeometry`, which the draft refuses. Name the writable type, or let `persistShapes` write it:

```ts expect-error=TS2322
import type { ShapeGeometry } from '@bruno00o/graph'
import type { ShapeEdit } from '@bruno00o/graph/editor'
import type { Collection } from '@tanstack/db'

type Zone = { id: string; geometry: ShapeGeometry }
declare const zones: Collection<Zone, string>

export function save(edit: ShapeEdit) {
  if (edit.type !== 'change' || edit.geometry === undefined) return
  const geometry = edit.geometry
  zones.update(String(edit.key), (draft) => {
    draft.geometry = geometry
  })
}
```

```ts
import type { Mark, ShapeGeometry } from '@bruno00o/graph'
import type { ShapeEdit, WritableShapeGeometry } from '@bruno00o/graph/editor'
import type { Collection } from '@tanstack/db'

type Zone = { id: string; geometry: ShapeGeometry }
declare const zones: Collection<Zone, string>

export function save(edit: ShapeEdit<Mark, WritableShapeGeometry>) {
  if (edit.type !== 'change' || edit.geometry === undefined) return
  const geometry = edit.geometry
  zones.update(String(edit.key), (draft) => {
    draft.geometry = geometry
  })
}
```

A row of your own that keeps a `ShapeGeometry` it stored earlier still needs a cast to go into a draft: type that field as `WritableShapeGeometry` instead.
