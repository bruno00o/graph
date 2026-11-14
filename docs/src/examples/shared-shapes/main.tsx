import { defineGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { persistShapes } from '@bruno00o/graph/db'
import { useShapeEditor } from '@bruno00o/graph/editor/react'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { shapes } from '@bruno00o/graph/shapes'
import { createCollection, localStorageCollectionOptions } from '@tanstack/db'
import { type Ref, useEffect, useState } from 'react'
import { messages } from './messages'
import '../shared/overlays.css'
import './shared-shapes.css'

interface Zone {
  id: string
  tone: string
  geometry: ShapeGeometry
}

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const start: Zone[] = [
  {
    id: 'north',
    tone: 'a',
    geometry: {
      rings: [
        [
          { x: -320, y: -230 },
          { x: -60, y: -270 },
          { x: -20, y: -60 },
          { x: -280, y: -20 },
        ],
      ],
    },
  },
  {
    id: 'east',
    tone: 'b',
    geometry: { x: 60, y: -250, width: 250, height: 160, cornerRadius: 14 },
  },
  { id: 'south', tone: 'c', geometry: { center: { x: -150, y: 160 }, radius: 110, inner: 50 } },
  {
    id: 'track',
    tone: 'd',
    geometry: {
      points: [
        { x: 40, y: 60 },
        { x: 160, y: 10 },
        { x: 260, y: 130 },
        { x: 360, y: 70 },
      ],
    },
  },
]

const home = new Map(start.map((zone) => [zone.id, zone]))

const items: Item[] = [
  { id: 'a', x: -200, y: -140 },
  { id: 'b', x: 180, y: -170 },
  { id: 'c', x: -150, y: 160 },
  { id: 'd', x: 260, y: 130 },
  { id: 'e', x: 40, y: 260 },
]

const zones = createCollection(
  localStorageCollectionOptions({
    id: 'shared-shapes',
    storageKey: 'graph-docs-shared-shapes',
    getKey: (zone: Zone) => zone.id,
  }),
)

await zones.preload()
if (zones.size === 0) zones.insert(start)

const definition = defineGraph({
  marks: [
    shapes(zones, { name: 'zones', color: 'tone', strokeWidth: 2 }),
    nodes(items, { x: 'x', y: 'y', size: 16 }),
  ],
  states: { saving: { opacity: 0.6 } },
  interaction: { lasso: true },
})

function resetZones(): void {
  const kept = start.filter((zone) => zones.has(zone.id))
  const missing = start.filter((zone) => !zones.has(zone.id))
  if (kept.length > 0) {
    zones.update(
      kept.map((zone) => zone.id),
      (drafts) => {
        for (const draft of drafts) {
          const origin = home.get(draft.id)
          if (origin) draft.geometry = origin.geometry as typeof draft.geometry
        }
      },
    )
  }
  if (missing.length > 0) zones.insert(missing)
}

function SharedEdits({ live }: { readonly live: boolean }) {
  const { editor } = useShapeEditor()
  useEffect(() => {
    if (!editor) return
    return persistShapes(editor, { collection: zones, live, pendingState: 'saving' })
  }, [editor, live])
  return null
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [live, setLive] = useState(true)
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(start.length, items.length)}
    >
      <SharedEdits live={live} />
      <div className="example-actions">
        <label className="example-button shared-shapes-live">
          <input type="checkbox" checked={live} onChange={() => setLive((value) => !value)} />
          {messages.live}
        </label>
        <button className="example-button" type="button" onClick={resetZones}>
          {messages.reset}
        </button>
      </div>
    </Graph>
  )
}
