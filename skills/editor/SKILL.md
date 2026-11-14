---
name: editor
description: >
  Use when letting people draw, move, reshape, resize, copy, reorder, delete and
  type text into the shapes of a @bruno00o/graph graph with the pointer and the
  keys: createShapeEditor and mountShapeEditor, the React ShapeEditor component
  and useShapeEditor hook, drawing tools and a toolbar, snapping, undo and redo,
  text in shapes, writing the proposed edits back to arrays or to a TanStack DB
  collection with persistShapes, and showing who else is editing with
  showPresence.
metadata:
  purpose: >
    The @bruno00o/graph shape editor: tools, gestures and keys, edits proposed to
    the data, drafts and lost edits, text, undo, React, maps, persistence and
    presence, with the mistakes that lose edits or leave shapes unchanged.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/editor/index.ts
  - src/editor/editor.ts
  - src/editor/edits.ts
  - src/editor/draw.ts
  - src/editor/view.ts
  - src/editor/react.tsx
  - src/db/persist-shapes.ts
  - src/db/presence.ts
  - docs/content/docs/(guide)/editing-shapes.mdx
  - docs/content/docs/api/editor.mdx
  - docs/content/docs/api/shape-editor.mdx
  - docs/content/docs/api/persist-shapes.mdx
  - docs/content/docs/api/show-presence.mdx
requires:
  - core
  - shapes
---

# Edit shapes with the pointer and the keys

Load the core and shapes skills first (`intent load @bruno00o/graph#core`, then `#shapes`): the editor works on the shapes of `shapes()` marks. It draws new shapes, moves and reshapes them, resizes them by the handles of their box, copies, reorders and removes them, opens a text input on them, and undoes. It never changes your data: each gesture ends with a batch of edits that your code writes to the data, or not. Until the data answers, the editor draws the shape as proposed.

`createShapeEditor` and `mountShapeEditor` come from `@bruno00o/graph/editor`, `<ShapeEditor>` and `useShapeEditor` from `@bruno00o/graph/editor/react`, and `persistShapes` and `showPresence` from `@bruno00o/graph/db`. A graph without an editor loads none of its code.

## Setup

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { applyShapeEdits, createShapeEditor, mountShapeEditor } from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; order?: number; geometry: ShapeGeometry }

let zones: Zone[] = [
  { id: 'north', geometry: { rings: [[[0, 0], [300, 0], [300, 200], [0, 200]]] } },
  { id: 'pond', geometry: { center: { x: 450, y: 100 }, radius: 80 } },
]

const define = (data: Zone[]) =>
  defineGraph({ marks: [shapes(data, { name: 'zones', order: 'order' })] })

const graph = mountGraph(document.body, { definition: define(zones), ariaLabel: 'Zones' })

const editor = createShapeEditor(graph, {
  onEdit: (edits) => {
    zones = applyShapeEdits(zones, edits)
    graph.update({ definition: define(zones) })
  },
})
mountShapeEditor(editor)
editor.on('editlost', ({ edits }) => console.log('not saved', edits.length))
```

- `createShapeEditor` takes the pointer and the keys of the graph; `mountShapeEditor` draws the shapes being edited, the handles and the text input in an SVG layer over the graph. Without the layer, a shape being edited disappears: the graph hides it until its data changes.
- One editor per graph: a second `createShapeEditor` on the same graph throws until the first is destroyed. `editor.destroy()` gives the pointer and the keys back and removes its layer; destroying the graph destroys both.
- `marks` lists the names of the editable shape marks, every shape mark by default. Shapes of other marks, and shapes whose geometry cannot be read, take the pointer as without the editor.
- The editor is typed by the graph: `edit.datum` is the item type of the mark, `edit.mark` its name. With several shape marks `datum` is the union of their item types and `mark` does not narrow it: narrow with `in` (`'text' in edit.datum`), as in [persistence](references/persistence.md).

## Core Patterns

### Gestures and keys

| Gesture | Effect |
| --- | --- |
| Press a shape and drag | Selects it and moves it with the other selected shapes |
| Shift, Cmd or Ctrl and press | Adds the shape to the selection, or removes it |
| Drag a point, or a midpoint | Moves the point, or adds one there |
| Alt and click a point | Removes it, down to 3 points for an area and 2 for a line |
| Drag a handle of the box | Resizes from the opposite handle; Shift keeps the proportions |
| Arrows, Shift and arrows | Move the selected shapes by 1 or 10 pixels |
| Delete or Backspace | Removes the point last pressed, or the selected shapes |
| Escape | Cancels the gesture, else clears the selection |
| Space held and drag | Moves the view, even from a shape |

- The selection is the selection of the graph (`graph.selection.get().shapes`, `selectionchange`, controlled mode included); a press on a shape replaces the nodes and edges selected. With `interaction: { select: false }` a press moves a shape without selecting it, so no handles show; with `select: 'single'`, Shift does not add.
- Points show on one selected area or line; a rectangle, a circle and several shapes show the 8 handles of their box. When points are closer than 6 screen pixels on average, or more than 1,000 show, only the nearest point and midpoint get a handle.
- A press away from editable shapes goes to the graph: nodes drag, the background pans, Shift and drag draws the lasso. A still press on a shape emits `click`; a drag emits neither `click` nor `dragstart`. A second finger cancels the gesture and pinches.
- A pinned shape (`node`) moves around its node: its edits stay relative to the node, and the node does not move.

### Write edits back

An edit is `{ type: 'add', key, mark, geometry, datum?, tool?, text? }`, `{ type: 'change', key, mark, datum, geometry?, order?, text? }` (only the fields that change) or `{ type: 'remove', key, mark, datum }`; `datum` is the item before the edit. `onEdit` and the `edit` event receive the same batch, once per gesture.

- `applyShapeEdits(items, edits, fields)` returns a new array: changed items are copies, the others the same objects, new items at the end (a copy of `datum` for a duplicate). It reads keys from `id` and writes `geometry`, `order` and `text`; `fields` renames them, `mark` keeps the edits of one mark, `create` builds new items. `items` is never changed.
- The new geometry keeps the form of the old one: object points stay objects with their other fields, pairs stay pairs, GeoJSON keeps its type and closing point, degrees stay degrees (longitudes from -180 to 180), points that did not move are the same values, and a GeoJSON `bbox` is dropped.
- Until the data of a shape changes, the editor hides the shape of the graph and draws the proposal; `editor.store.state.pending` lists these shapes. Any change of the item ends the wait. When nothing changes within `hold` (10,000 ms, `Infinity` waits for good), the data wins again and `editlost` carries the edits: the write failed, or your code declined it.
- A mark whose `geometry` is a function is edited, but `applyShapeEdits` writes a field: write the edits yourself.
- The `geometry` of an edit is a fresh `WritableShapeGeometry`: writable all the way down, never frozen, sharing nothing with your items. It assigns to a `ShapeGeometry` and to the draft of `collection.update` with no cast. Let `onEdit` infer the type of its edits; a parameter annotated `ShapeEdit` has a read-only geometry (`ShapeEdit<Mark, WritableShapeGeometry>` is the writable one).

With several shape marks, name them and split the edits:

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { applyShapeEdits, createShapeEditor, mountShapeEditor } from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; geometry: ShapeGeometry }
type Note = { id: string; text: string; geometry: ShapeGeometry }
declare const messages: { typeHere: string; noteText: string }

let zones: Zone[] = []
let notes: Note[] = []

const define = (z: Zone[], n: Note[]) =>
  defineGraph({
    marks: [
      shapes(z, { name: 'zones' }),
      shapes(n, {
        name: 'notes',
        fill: 'transparent',
        label: { text: 'text', wrap: true, scale: 'world', place: 'always', size: 14 },
      }),
    ],
  })

const graph = mountGraph(document.body, { definition: define(zones, notes), ariaLabel: 'Plan' })
const editor = createShapeEditor(graph, {
  marks: ['zones', 'notes'],
  textMark: 'notes',
  onEdit: (edits) => {
    zones = applyShapeEdits(zones, edits, { mark: 'zones' })
    notes = applyShapeEdits(notes, edits, { mark: 'notes' })
    graph.update({ definition: define(zones, notes) })
  },
})
const view = mountShapeEditor(editor, { placeholder: messages.typeHere })
view.input.setAttribute('aria-label', messages.noteText)
```

### Draw new shapes

`editor.setTool(tool)` or the `tool` option chooses what a press does; `editor.store.state.tool` holds it for a toolbar. `'select'` (default) selects, moves and reshapes; the others draw:

| Tool | Gesture |
| --- | --- |
| `'rectangle'` | Drag corner to corner, or click both corners; Shift makes a square |
| `'circle'` | Drag from the center, or click the center then the edge |
| `'line'` | Click point by point, then Enter or a double click |
| `'polygon'` | Click point by point, then Enter, a double click or a click on the first point |
| `'freehand'` | Drag: closes into an area when the ends meet, else stays a line |
| `'text'` | Draw a box like a rectangle, then type |

- Two clicks work wherever a drag does. With a line or a polygon, Shift turns the next segment by `snap.angle` (15 degrees), Backspace, Delete or Cmd or Ctrl and Z take back the last point, and Escape drops the shape.
- A drawing tool takes every press with the main button, on shapes and nodes too, except with Space held. The double click that ends a shape emits no `doubleclick` and folds no group. Set `'select'` to give the pointer back.
- The tool stays active after each shape: `state.tool` does not return to `'select'`, so the next press draws another. A toolbar that wants one shape per click calls `editor.setTool('select')` from `onEdit`, on a batch that holds an `'add'`.
- A finished shape is an `'add'` with `tool`, the key of `newKey` (`crypto.randomUUID()` by default) and the mark of `newMark` (first name of `marks`, else the first shape mark). It is selected at once.
- `units: 'auto'` (default) draws in degrees on a map (GeoJSON `Polygon` and `LineString`, circles around a place with radii in meters) and in world units elsewhere (`{ x, y, width, height }`, `{ center, radius }`, `rings`, `points`); `'world'` and `'degrees'` force one. Edited shapes keep their own units.
- `snap: { grid }` snaps drawn and dragged points, resized boxes and moved shapes (by the top left corner of their box) to a spacing in world units, or to the lines of the background grid shown at this zoom with `'background'`, which needs `background: { grid }` in the definition: without one nothing snaps and a development build warns once. A map has no background grid, so give a spacing there. The arrow keys do not snap.

### Copy, reorder, undo

- `editor.duplicate()` (Cmd or Ctrl and D) proposes copies 16 screen pixels lower and to the right, as `'add'` edits whose `datum` is the copied item, and selects them.
- `editor.raise()` and `editor.lower()` propose `'change'` edits with a new `order`, written by `applyShapeEdits` to `order`: the mark must read it with its `order` option.
- `editor.remove(keys?)` proposes to remove shapes, the selected ones by default.
- `editor.undo()` and `redo()` (Cmd or Ctrl and Z, Shift and Cmd or Ctrl and Z, Ctrl and Y) propose the edits that take back or make again a whole batch; `canUndo` and `canRedo` in the store drive buttons. The undo is selective: a batch whose shapes changed since, by someone else, by your code or by a declined write, is skipped and forgotten. Undoing a removal proposes an `'add'` with the same key and the removed item in `datum`. `history` keeps 100 batches, 0 for none. Changes that do not come from the editor are not in it.
- `editor.cancel()` cancels the gesture, the drawing and the text being typed.

### Type text into shapes

A shape has text when its mark has a `label`. A double click on it with the select tool, Enter while it is the only selected shape, or `editor.editText(key)` opens a `textarea` over it in the font and size of its label; Enter starts a line, and Escape, Cmd or Ctrl and Enter, a press elsewhere, another tool or the loss of focus close it and propose a `'change'` with `text`: Escape in a text box commits what was typed, unlike Escape elsewhere, which cancels. `editor.cancel()` drops the typing instead. The `'text'` tool proposes an `'add'` with `tool: 'text'` and `text` for the mark of `textMark` (`newMark` by default); a box left empty proposes nothing.

- `applyShapeEdits` writes `text` to the `text` field: give the mark `label: { text: 'text' }`, or pass `fields: { text }` with the field the label reads.
- When the text needs more lines than the box holds, the same edit makes the box taller, top edge in place; a circle never grows. The label options `wrap: true`, `scale: 'world'` (world units, meters for a shape in degrees) and `place: 'always'` turn a label into the text of a box (shapes skill).
- The library writes no text: `placeholder` of `mountShapeEditor` and the `aria-label` of `view.input` come from your app. `editor.store.state.text` gives the text, its box on screen and its font, to draw an input of your own with `setText` and `endText`.

### Toolbar and keys

The keys reach the editor only while `graph.element` has the focus. A button keeps the focus after a click, so give it back when a tool is chosen:

```tsx
import type { ShapeEdit, ShapeEditorTool } from '@bruno00o/graph/editor'
import { useShapeEditor } from '@bruno00o/graph/editor/react'
import { useGraph } from '@bruno00o/graph/react'

declare const labels: Record<ShapeEditorTool | 'undo', string>
const tools: readonly ShapeEditorTool[] = ['select', 'rectangle', 'polygon', 'text']

export function Toolbar({ onEdit }: { onEdit: (edits: readonly ShapeEdit[]) => void }) {
  const graph = useGraph()
  const { state, editor } = useShapeEditor({ onEdit })
  const choose = (tool: ShapeEditorTool) => {
    editor?.setTool(tool)
    graph.element.focus()
  }
  return (
    <div className="toolbar">
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          aria-pressed={state.tool === tool}
          onClick={() => choose(tool)}
        >
          {labels[tool]}
        </button>
      ))}
      <button type="button" disabled={!state.canUndo} onClick={() => editor?.undo()}>
        {labels.undo}
      </button>
    </div>
  )
}
```

The editor gets arrows, Delete, Backspace and Escape while a shape is selected or a gesture runs, Enter and Escape while a shape is drawn, and the undo, redo and duplicate shortcuts; other keys go to the graph. The layer is hidden from assistive technologies.

### React

`<ShapeEditor>` and `useShapeEditor` create the editor and its layer for the enclosing `<Graph>` or `<MapGraph>`, or for `graph`, in a layout effect, and destroy both on unmount (StrictMode leaves one). `useShapeEditor` returns `{ state, editor }`, `editor` being `null` until the first layout effect. `onEdit` and `newKey` are read at each use, so inline functions are fine; the other options go through `update`. The `tool` prop sets the tool when it changes. Render one of them per graph: the toolbar above is the editor, so do not add a `<ShapeEditor>` next to it.

```tsx
import { defineGraph, type ShapeGeometry } from '@bruno00o/graph'
import { applyShapeEdits } from '@bruno00o/graph/editor'
import { ShapeEditor } from '@bruno00o/graph/editor/react'
import { Graph } from '@bruno00o/graph/react'
import { shapes } from '@bruno00o/graph/shapes'
import { useMemo, useState } from 'react'

type Zone = { id: string; geometry: ShapeGeometry }

export function Zones({ initial }: { initial: Zone[] }) {
  const [zones, setZones] = useState(initial)
  const definition = useMemo(
    () => defineGraph({ marks: [shapes(zones, { name: 'zones' })] }),
    [zones],
  )
  return (
    <Graph definition={definition} ariaLabel="Zones">
      <ShapeEditor onEdit={(edits) => setZones((current) => applyShapeEdits(current, edits))} />
    </Graph>
  )
}
```

Inside `<Graph>` without `graph`, the edits are not typed by the marks: pass `graph` (the instance from the `ref`, `null` until mounted) or type arguments to type `datum` and `mark`.

### Maps and large edits

- On a map, flat or globe, the editor takes the gesture from the map: the map does not pan while a shape moves or is drawn, and the double click that ends a shape does not zoom. On the globe, a circle or a rectangle in world units, such as a pinned shape, faces the screen as the graph draws it, and so do its preview, its handles and its text input. Shapes in degrees get their edits in degrees, a circle around a place keeps its radii in meters, and a move is a translation on the flat Mercator plane, also on the globe (a shape pushed toward a pole grows on the ground).
- Past 5,000 points in the shapes being moved, the graph slides its own shapes on the GPU instead of an SVG preview: sliding shapes are not picked until they land. A circle placed in degrees always moves as a preview. Dragging a polygon of 5,000 points costs about 1 ms per frame; reshaping it costs about 5 ms on release.

### Save to a collection, show others

With a TanStack DB collection as the source of the shapes, `persistShapes(editor, { collection, create })` writes each edit into it (changed fields only, removed rows, new rows through `create`) and returns a function that stops. `live: true` writes during the gesture too. `showPresence(graph, { collection, me, create })` shows the cursors and selections of the other people from a collection of presence rows, with or without an editor. Details: [persistence](references/persistence.md), [presence](references/presence.md).

## Common Mistakes

### HIGH Creating the editor without its layer

`createShapeEditor` alone takes the gestures, and the graph hides the shapes being edited and the ones waiting for their data: they vanish during a drag and come back on the data change. Call `mountShapeEditor(editor)` (the React component and hook do it).

### HIGH Writing the edits without updating the graph

An array source changes only through `graph.update` with a new definition (or a new React state that rebuilds it). Writing the array and stopping there leaves every edit drawn as proposed, then `editlost` after `hold` and the shape jumps back.

Wrong:

```ts no-check
createShapeEditor(graph, { onEdit: (edits) => { zones = applyShapeEdits(zones, edits) } })
```

Correct:

```ts no-check
createShapeEditor(graph, {
  onEdit: (edits) => {
    zones = applyShapeEdits(zones, edits)
    graph.update({ definition: define(zones) })
  },
})
```

### HIGH Changing the items in place

The graph reads an item that is the same object as before as unchanged, so assigning `edit.datum.geometry` or pushing into a ring changes nothing on screen and ends in `editlost`. Build new items: `applyShapeEdits` copies the changed ones and returns a new array.

### HIGH Two editors on one graph

A second `createShapeEditor`, a `<ShapeEditor>` next to a `useShapeEditor` for the same graph, or an editor created in an effect without `destroy` in its cleanup throws `createShapeEditor: this graph has an editor already, destroy it first`. Keep one editor and pass it, or its state, to the components that need it.

### HIGH Listing a mark without a name in `marks`

`marks` matches the `name` of shape marks. An unnamed mark has no name to list, so a typed graph refuses any string, and an untyped one never edits it. Name the mark.

```ts expect-error=TS2322
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { createShapeEditor } from '@bruno00o/graph/editor'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; geometry: ShapeGeometry }
const zones: Zone[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [shapes(zones)] }),
  ariaLabel: 'Zones',
})

createShapeEditor(graph, { marks: ['zones'] })
```

### HIGH Applying every edit to one array

Without `mark`, `applyShapeEdits` applies the whole batch: with two shape marks, the notes drawn by the text tool are appended to the zones too and show twice (`duplicate-key` issues). Pass `{ mark: 'zones' }` and `{ mark: 'notes' }`, one call per array.

### HIGH Saving drawn shapes without `create`

`persistShapes` writes changes and removals to existing rows, but a drawn or copied shape has no row: without `create` it waits, then `editlost`. Give `create: (edit) => row`; only the undo of a removal is inserted without it.

### MEDIUM Handling the edits twice

`onEdit` and every `edit` listener get the same batch. Writing it in both, or calling `persistShapes` and also writing in `onEdit`, adds each new shape twice. Write each batch in one place.

### MEDIUM A writer of your own that writes only the geometry

A batch also carries `order` (raise, lower) and `text`. A writer that copies `geometry` and drops the rest loses those edits after `hold`. A mark that reads its geometry through a function needs the same care: `applyShapeEdits` writes the `geometry` field, which that function does not read.

### MEDIUM `raise` and `lower` on a mark that does not read `order`

They propose a new `order`, written to the `order` field; a mark without `order: 'order'` keeps its drawing order, so the button seems to do nothing.

### MEDIUM Text on a mark without a matching `label`

`editText` and the double click do nothing on a mark without `label`, and the text tool on such a `textMark` proposes a box whose text never shows. `applyShapeEdits` writes `text`: a label that reads another field never shows the typed text unless `fields: { text: 'title' }` names it.

### MEDIUM Snapping to the background without a background grid

`snap: { grid: 'background' }` follows the background grid of the definition (`background: { grid: 'lines' }`); without one nothing snaps, and a development build only warns once. A map never has one. Add the grid, or give a spacing in world units.

### MEDIUM Keys that never reach the editor

Delete, Escape, Enter, the arrows and the shortcuts only reach the editor while `graph.element` has the focus. After a click on a toolbar button, call `graph.element.focus()`.

### MEDIUM Selections of others that never show

`showPresence` shows selections only in the free states `presence1` to `presence8` that the definition declares: with none declared, only cursors show. Declare them with a style by kind ([presence](references/presence.md)).

### MEDIUM Cursors that land in different places

Pointers are written in world units. Two clients see a cursor and a selection at the same place only when their elements have the same positions: data positions, a map, or a deterministic layout.

## Completion

The task is done when:

- one editor exists per graph, with `mountShapeEditor` or the React component or hook, and the editable marks are named in `marks`;
- each batch is written once, to new arrays or rows, with `graph.update` for array sources, one `applyShapeEdits` per mark, and `order` and `text` read by the marks;
- drawn shapes reach the data (`create` with `persistShapes`), and `editlost` is handled;
- a toolbar gives the focus back to `graph.element`, and `placeholder` and `aria-label` come from the app;
- presence states are declared and positions agree between clients;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Editing shapes](https://bruno00o.github.io/graph/docs/editing-shapes), [createShapeEditor](https://bruno00o.github.io/graph/docs/api/editor), [ShapeEditor](https://bruno00o.github.io/graph/docs/api/shape-editor), [persistShapes](https://bruno00o.github.io/graph/docs/api/persist-shapes), [showPresence](https://bruno00o.github.io/graph/docs/api/show-presence)
- Examples: [shape editing](https://bruno00o.github.io/graph/examples/shape-editing), [shared shapes](https://bruno00o.github.io/graph/examples/shared-shapes)
- Related skills: shapes (marks, labels, units), tanstack-db (collections), react, map, interaction (selection).
