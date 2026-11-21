---
name: react
description: >
  Use when showing a @bruno00o/graph graph in a React 19 app: rendering it with
  the <Graph> component, building its definition from props or state without
  restyling on every render, drawing HTML overlays and tooltips over it, reading
  the hovered node, the selection or the view in components, handling clicks,
  driving the graph from a toolbar or side panel elsewhere in the page,
  controlling the selection or the view from React state, mounting under
  StrictMode, moving the graph onto a MapLibre map and back with a surface, and
  suspending the graphs out of sight on a page of many graphs. A graph that
  lives only inside a MapLibre map uses <MapGraph>.
metadata:
  purpose: >
    The React binding of @bruno00o/graph: the <Graph> component and its props,
    the useGraph, useGraphState and useGraphEvent hooks inside and outside
    <Graph>, typed selectors and handlers, controlled props, and the render
    patterns that keep the graph from restyling or failing.
  type: framework
  framework: react
  library: '@bruno00o/graph'
sources:
  - src/react/index.tsx
  - src/react/graph.tsx
  - src/react/context.ts
  - src/map/react.tsx
  - src/host/data-status.ts
  - docs/content/docs/(guide)/react.mdx
  - docs/content/docs/(guide)/typescript.mdx
  - docs/content/docs/api/graph-component.mdx
  - docs/content/docs/api/hooks.mdx
  - docs/content/docs/api/anchor.mdx
requires:
  - core
---

# Show a graph in React

Load the core skill first (`intent load @bruno00o/graph#core`): data, marks, states and the instance API are the same in React. This skill covers what React changes: `<Graph>` mounts the graph, hooks read it, and props control it.

## Setup

1. Install React 19 next to the package. `@bruno00o/graph/react` needs `react` and `react-dom` 19.

   ```sh
   npm install @bruno00o/graph react react-dom
   ```

2. Import the theme once, in your entry file. TypeScript checks this side-effect import against CSS module types: bundlers declare them (`vite/client`), otherwise add `declare module '*.css'` to a `.d.ts` file.

   ```ts no-check
   import '@bruno00o/graph/theme.css'
   ```

3. Render `<Graph>` with a definition built once per data change, and a height.

   ```tsx
   import { defineGraph, edges, nodes } from '@bruno00o/graph'
   import { Graph } from '@bruno00o/graph/react'
   import { useMemo } from 'react'

   type Item = { id: string; label: string; group: string }
   type Link = { id: string; from: string; to: string }

   const linkOptions = { source: 'from', target: 'to', arrow: 'target' } as const
   const itemOptions = { color: 'group', label: (item: Item) => item.label } as const

   export function SampleGraph({ items, links }: { items: Item[]; links: Link[] }) {
     const definition = useMemo(
       () => defineGraph({ marks: [edges(links, linkOptions), nodes(items, itemOptions)] }),
       [items, links],
     )
     return <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }} />
   }
   ```

   Result: `<Graph>` renders a `div` sized by `className` or `style`, with the graph inside. The `div` keeps a position that your class or style gives it (`absolute inset-0`); only when nothing positions it does the component make it `relative`. A new `definition` prop is applied with `update`: positions, view, selection and states stay.

## Core Patterns

### Keep the definition stable

- Build the definition outside the component, or in `useMemo` keyed on the data arrays.
- Hoist functions used in mark options (`label: (item) => ...`) out of the component. Options are compared by content, functions by identity: a function created in render restyles every item of its mark on every render.
- Make a `historyFrom(...)` journal once (module level, or `useMemo` keyed on its entries) and give the same object to each definition: one built in render is a new history, indexed again with every element read again (time skill).
- Hoist the `entries` given to `<Legend>` or `useLegend` too: a rule function made in render reads every element again (tools skill).
- Replace data arrays and changed items with new objects, as in the core skill. `setItems((items) => [...items, item])` is right; `items.push(item)` is not.

### Handle events with props

Event props (`onClick`, `onSelectionChange`, `onLayoutEnd`, `onLoadingChange`, ...) are typed from the definition and always call the latest function, so they need no `useCallback`. `onContextMenu` does not stop the browser menu: call `event.originalEvent.preventDefault()` to show your own.

```tsx
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'
import { useState } from 'react'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = [{ id: 'n1', label: 'Node 1' }, { id: 'n2', label: 'Node 2' }]
const links: Link[] = [{ id: 'e1', from: 'n1', to: 'n2' }]
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
})

export function ClickedLabel() {
  const [clicked, setClicked] = useState<string | null>(null)
  return (
    <>
      <Graph
        definition={definition}
        ariaLabel="Sample graph"
        style={{ height: 480 }}
        onClick={({ target }) => {
          setClicked(target?.kind === 'node' ? target.datum.label : null)
        }}
      />
      <p>{clicked ?? 'Nothing clicked'}</p>
    </>
  )
}
```

### Read and drive the graph from children

Children of `<Graph>` render over the canvas and reach the graph through hooks: `useGraph()` returns the instance, `useGraphState(selector)` a slice of its state, `useGraphEvent(name, handler)` subscribes for the life of the component. A child cannot see the definition, so name the marks in the selector's parameter type, taken from the definition.

```tsx
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Anchor, type GraphState, Graph, useGraph, useGraphEvent, useGraphState } from '@bruno00o/graph/react'
import { shallow } from '@tanstack/store'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  states: { muted: { opacity: 0.2 } },
})
type Marks = (typeof definition.marks)[number]

function Tooltip() {
  const hovered = useGraphState((state: GraphState<string, Marks>) => state.hovered)
  if (hovered?.kind !== 'node') return null
  return (
    <Anchor node={hovered.key} side="right" align="start">
      <div className="tooltip">{hovered.datum.label}</div>
    </Anchor>
  )
}

function Toolbar() {
  const graph = useGraph<'muted', Marks>()
  const counts = useGraphState(
    (state) => ({ nodes: state.selection.nodes.length, edges: state.selection.edges.length }),
    { compare: shallow },
  )
  useGraphEvent('layoutend', () => graph.view.fit({ duration: 300 }))
  return (
    <div className="toolbar">
      <button type="button" onClick={() => graph.states.set('muted', graph.selection.get())}>
        Mute {counts.nodes} nodes
      </button>
    </div>
  )
}

export function App() {
  return (
    <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }}>
      <Tooltip />
      <Toolbar />
    </Graph>
  )
}
```

- `useGraphState` compares slices with `Object.is`. A selector that builds an object or array needs `compare: shallow` from `@tanstack/store`, or the component renders on every state change.
- `<Anchor>` pins its children to a node, an edge or a point and follows the view without rendering again. It needs `react-dom`.
- `useGraph<S, M>()` and the selector types are trusted, not checked: take them from the definition.

### Show a loading overlay

A live source that loads over time (a TanStack DB collection, a live query, `createExploration`) puts `data: { loading, failed }` in the graph state. Read it in a child of `<Graph>`, or listen with the `onLoadingChange` prop. `data` keeps its identity until `loading` or `failed` changes, so the default `Object.is` comparison is enough. The graph draws no indicator of its own, and its first automatic layout and fit wait for the sources (`waitForData`, core skill).

```tsx
import { defineGraph, type LiveSource, nodes } from '@bruno00o/graph'
import { Graph, useGraphState } from '@bruno00o/graph/react'
import { force } from '@bruno00o/graph/layouts/force'
import { useState } from 'react'

type Item = { id: string; label: string }

declare const rows: LiveSource<Item>

const definition = defineGraph({
  marks: [nodes(rows, { label: 'label' })],
  layout: force(),
})

function LoadingOverlay() {
  const data = useGraphState((state) => state.data)
  if (data.failed.length > 0) return <p role="alert">Some data could not be loaded</p>
  return data.loading ? <p role="status">Loading</p> : null
}

export function LiveGraph() {
  const [ready, setReady] = useState(false)
  return (
    <>
      <Graph
        definition={definition}
        ariaLabel="Graph of live rows"
        style={{ height: 480 }}
        onLoadingChange={({ loading }) => setReady(!loading)}
      >
        <LoadingOverlay />
      </Graph>
      <p>{ready ? 'Complete' : 'Loading'}</p>
    </>
  )
}
```

### Drive the graph from outside `<Graph>`

A toolbar, panel or status bar elsewhere in the page gets the instance through the `ref` of `<Graph>`, kept in state, and passes it in the `graph` option of the hooks. The instance is `null` on the first render: the hooks then return `undefined` and subscribe to nothing, and follow the graph once it exists. With a typed `graph`, selectors and handlers need no annotation. The `graph` option of `useGraphState`, `useGraphEvent`, `useLegend` and `useTimeline`, and the `graph` prop of `<Legend>` and `<Timeline>`, also take a `GraphCore` made by `createGraph` (headless skill). The package exports no helper for the instance type of a definition: declare `InstanceOf` below once in your app.

```tsx
import { defineGraph, edges, type GraphDefinition, type GraphInstance, nodes } from '@bruno00o/graph'
import { Graph, useGraphEvent, useGraphState } from '@bruno00o/graph/react'
import { useState } from 'react'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
})

type InstanceOf<D> = D extends GraphDefinition<infer S, infer M> ? GraphInstance<S, M> : never
type SampleInstance = InstanceOf<typeof definition>

function StatusBar({ graph }: { graph: SampleInstance | null }) {
  const selected = useGraphState((state) => state.selection.nodes.length, { graph })
  const [last, setLast] = useState('')
  useGraphEvent(
    'click',
    ({ target }) => setLast(target?.kind === 'node' ? target.datum.label : ''),
    { graph },
  )
  return (
    <footer>
      {selected ?? 0} selected {last}
      <button type="button" disabled={!graph} onClick={() => graph?.selection.clear()}>
        Clear selection
      </button>
    </footer>
  )
}

export function Page() {
  const [graph, setGraph] = useState<SampleInstance | null>(null)
  return (
    <>
      <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }} ref={setGraph} />
      <StatusBar graph={graph} />
    </>
  )
}
```

The `graph` option wins over the graph in context. `<Legend>`, `<Minimap>`, `<Timeline>`, `useLegend` and `useTimeline` take the same `graph` prop or option: `null` waits for a graph, and `graph: false` on the timeline follows none (time skill).

### Control the selection or the view

Pass `selection` with `onSelectionChange` (or `view` with `onViewChange`) to make React the owner. Every request, from clicks, keys, the lasso or code, reaches the callback, and only the prop changes the graph. Whether a graph is controlled is decided at mount, so pass the prop from the first render.

```tsx
import { defineGraph, type ElementKeysInput, nodes } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'
import { useState } from 'react'

type Item = { id: string; label: string }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { label: 'label' })] })

export function ControlledGraph() {
  const [selection, setSelection] = useState<ElementKeysInput>({ nodes: [] })
  return (
    <Graph
      definition={definition}
      ariaLabel="Sample graph"
      style={{ height: 480 }}
      selection={selection}
      onSelectionChange={(event) => setSelection(event.selection)}
    />
  )
}
```

Folded groups (`folded`, `onFoldChange`), hidden layers (`hiddenLayers`, `onLayerChange`) and the time window (`time`, `onTimeChange`) work the same way.

### Move the graph onto a map and back

`<Graph surface>` takes a surface from `useMapSurface(map)` (`@bruno00o/graph/map/react`), or `null` for its own canvas. A new `surface` and a new `definition` apply in one `update`, so give the definition of the side you move to in the same render; the instance, its children, the hooks and the companions stay mounted and keep their state, and the graph keeps its positions and view on each side. The map element is a child of `<Graph>`, hidden with `opacity` (never `display: none`) while the graph is on its canvas. Read the side with `useGraphState((state) => state.surface)` or `onSurfaceChange`. A map removed or a surface released sends the graph back to its canvas, and it stays there until the prop changes. Full recipe: map skill, `references/surfaces.md`.

### Many graphs on a page

Chrome and Safari keep at most 16 WebGL contexts per page, one per graph. Give `suspended` to the graphs out of sight: each one frees its context, keeps its instance, children, overlays and state, shows a copy of its last frame, and draws again once the prop turns `false` (60 to 120 ms at 100,000 nodes, against 300 to 450 ms for a first mount). Given `true` at the mount, a graph creates no context until then. `onSuspendChange` and `useGraphState((state) => state.suspended)` read it; `keepFrame={false}` keeps no copy (the box stays empty until the graph resumes). `<MapGraph>` has neither prop.

```tsx
import type { GraphDefinition } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'
import { useEffect, useState } from 'react'

export function Card({ definition }: { definition: GraphDefinition }) {
  const [card, setCard] = useState<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!card) return
    const observer = new IntersectionObserver(([entry]) => setShown(entry?.isIntersecting ?? false))
    observer.observe(card)
    return () => observer.disconnect()
  }, [card])
  return (
    <section ref={setCard} style={{ height: 320 }}>
      <Graph
        definition={definition}
        ariaLabel="Card graph"
        style={{ height: '100%' }}
        suspended={!shown}
      />
    </section>
  )
}
```

A graph whose context the browser took (more than 16 on the page) stays empty and gets it back only from `resume()`: call it through the `ref` when the graph comes into sight, or let the prop turn `false` (core skill, `references/rendering.md`).

### StrictMode and lifetime

`<Graph>` mounts the graph once, in a layout effect, and destroys it on unmount. StrictMode mounts, destroys and mounts again: one instance remains, and the `ref` receives the live one. Do not call `mountGraph` in a component; if you must, do it in `useEffect` and call `destroy()` in its cleanup.

Props that start the graph are read once, at the mount, and StrictMode mounts twice: `initialView`, `initialTime`, `initialHiddenLayers`, `initialFolded` and `initialPositions`. To bring nodes back where they were when the component mounts again, keep `graph.positions.snapshot()` before it unmounts and pass it as `initialPositions` (layouts skill): a `Map` or an array, never a one-shot iterator. `initialFolded` also takes a function of the group node, asked once for each group when it first has a child (groups skill); the function of the latest render is the one called.

```tsx
import type { Key, Point } from '@bruno00o/graph'
import { defineGraph, nodes } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'

type Item = { id: string; parent: string | null }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items, { parent: 'parent' })] })

export function RestoredGraph({ saved }: { saved: Map<Key, Point> | undefined }) {
  return (
    <Graph
      definition={definition}
      ariaLabel="Sample graph"
      style={{ height: 480 }}
      initialPositions={saved}
      initialFolded={(group) => group.key === 'archive'}
    />
  )
}
```

## Common Mistakes

### HIGH Creating option functions or the definition in render

A definition rebuilt in render with an inline function (`label: (item) => item.name`) restyles every item of the mark on every render, and an unmemoized definition also reads the whole data again. Build it in `useMemo` keyed on the data, and hoist the functions. The same goes for `historyFrom(changes)` in render: a new history indexes its journal again and reads every element again. Source: [The Graph component](https://bruno00o.github.io/graph/docs/react#the-graph-component).

### HIGH Calling the hooks outside `<Graph>` without `graph`

`useGraph`, `useGraphState` and `useGraphEvent` throw outside `<Graph>` and `<MapGraph>` unless they get a `graph` option. In a sibling component, pass the instance kept from the `ref`, and handle `undefined` while it is `null`:

```tsx expect-error=TS2322
import type { GraphInstance } from '@bruno00o/graph'
import { useGraphState } from '@bruno00o/graph/react'

export function Count({ graph }: { graph: GraphInstance | null }) {
  const selected: number = useGraphState((state) => state.selection.nodes.length, { graph })
  return <span>{selected}</span>
}
```

Write `const selected = useGraphState(..., { graph }) ?? 0`. Source: [Outside of Graph](https://bruno00o.github.io/graph/docs/react#outside-of-graph).

### HIGH Object selectors without `shallow`

`useGraphState((state) => ({ ... }))` returns a new object for every state change, so the component renders on every hover and every frame of a view animation. Pass `{ compare: shallow }`, or select a primitive.

### MEDIUM Untyped selectors and handlers inside `<Graph>`

Inside `<Graph>`, hooks do not know the marks: an unannotated `state.hovered.datum` is `unknown`.

```tsx expect-error=TS18046
import { useGraphState } from '@bruno00o/graph/react'

export function Label() {
  const hovered = useGraphState((state) => state.hovered)
  return <span>{hovered ? hovered.datum.label : null}</span>
}
```

Annotate the parameter (`(state: GraphState<string, Marks>) => ...`), type `useGraph<S, M>()`, or annotate a handler with the payload type (`(event: GraphPointerEvent<Marks>) => ...`). Source: [TypeScript, React](https://bruno00o.github.io/graph/docs/typescript#react).

### MEDIUM Reading the graph structure during render

`graph.neighbors`, `graph.edgesOf`, `graph.datumOf`, `graph.history.of`, `graph.count` and `graph.issues` first apply pending data changes, which updates the store and renders the components that read it. Called while React renders, this can trigger React's "Cannot update a component while rendering a different component" warning. Call them in event handlers, effects or `useGraphEvent` handlers, and keep their results in state.

### MEDIUM Switching to a controlled prop after mount

`selection`, `view`, `folded`, `hiddenLayers` and `time` decide at mount whether the graph is controlled. A prop that starts `undefined` and is set later does not take control. Initialize the state before the first render (`{ nodes: [] }`), or use `initialView`, `initialFolded`, `initialTime`, `initialHiddenLayers` and `initialPositions` for a starting value without control.

### MEDIUM Giving `initialPositions` an iterator that StrictMode consumes

`initialPositions` is read at the mount, and StrictMode mounts, destroys and mounts again with the same prop. A one-shot iterator (`saved.entries()`, a generator) is spent by the first mount, so the second one restores nothing and the layout runs on every node. Pass the `Map` or an array.

```tsx
import type { Key, Point } from '@bruno00o/graph'
import { defineGraph, nodes } from '@bruno00o/graph'
import { Graph } from '@bruno00o/graph/react'

type Item = { id: string }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items)] })

export function Restored({ saved }: { saved: Map<Key, Point> }) {
  return (
    <>
      <Graph definition={definition} ariaLabel="Spent" initialPositions={saved.entries()} />
      <Graph definition={definition} ariaLabel="Kept" initialPositions={saved} />
    </>
  )
}
```

### MEDIUM Swapping `<Graph>` for `<MapGraph>` to change side

`<MapGraph>` mounts its own graph, and another `map`, `id` or `beforeId` mounts a new one. Rendering `<Graph>` on one side and `<MapGraph>` on the other destroys the graph at each switch: selection, positions, view, folded groups and companion state are lost. To move one graph, keep `<Graph>` and change its `surface` and `definition` together.

### MEDIUM Unmounting the graphs out of sight

Rendering `{shown && <Graph ... />}` to stay under the context limit destroys the graph each time it leaves the screen: view, selection, positions and child state are lost, the layout runs again and the first frame is paid again. Keep `<Graph>` mounted and pass `suspended={!shown}`.

### MEDIUM A `<Graph>` without a height

`<Graph>` fills its own `div`, which takes its size from `className` or `style`: a `div` positioned by your class (`absolute inset-0`) still needs a height from its parent. Without a height it draws nothing. Development builds warn once.

## Completion

The task is done when:

- the graph draws at its expected size, and changing data props updates it without losing positions or view;
- selectors that build objects or arrays pass `compare: shallow`, and option functions live outside render;
- selectors and handlers are typed (`tsc` passes without `any` or casts on `datum`);
- components outside `<Graph>` pass `graph` and handle the `null` first render;
- positions restored at a remount are passed as `initialPositions`, as a `Map` or an array;
- a graph that moves between a canvas and a map keeps one `<Graph>`, with `surface` and `definition` changing together;
- a page of many graphs suspends those out of sight with `suspended` instead of unmounting them;
- under StrictMode, the page shows one graph and no console error.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- [React guide](https://bruno00o.github.io/graph/docs/react), [TypeScript and React](https://bruno00o.github.io/graph/docs/typescript#react)
- API: [`<Graph>` props](https://bruno00o.github.io/graph/docs/api/graph-component), [hooks](https://bruno00o.github.io/graph/docs/api/hooks), [`<Anchor>`](https://bruno00o.github.io/graph/docs/api/anchor)
- Examples: [first graph in React](https://bruno00o.github.io/graph/examples/first-graph-react), [overlays](https://bruno00o.github.io/graph/examples/react-overlays), [controlled selection](https://bruno00o.github.io/graph/examples/controlled-selection)
- A graph that lives only inside a MapLibre map uses `<MapGraph>`, one that moves between a canvas and a map `<Graph surface>`, both from `@bruno00o/graph/map/react` with `useMapSurface`: see the [map guide](https://bruno00o.github.io/graph/docs/map#react) and [one graph, on the map or not](https://bruno00o.github.io/graph/docs/map#one-graph-on-the-map-or-not).
