import { defineGraph, nodes, type Point, type StateKindStyles } from '@bruno00o/graph'
import {
  type Presence,
  type PresenceSelection,
  persistShapes,
  showPresence,
} from '@bruno00o/graph/db'
import type { WritableShapeGeometry } from '@bruno00o/graph/editor'
import { useShapeEditor } from '@bruno00o/graph/editor/react'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { shapes } from '@bruno00o/graph/shapes'
import { createCollection, localStorageCollectionOptions } from '@tanstack/db'
import { type Ref, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { messages } from './messages'
import '../shared/overlays.css'
import './shared-shapes.css'

interface Zone {
  id: string
  tone: string
  geometry: WritableShapeGeometry
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

interface Seen {
  readonly id: string
  readonly pointer: Point | null
  readonly selection: PresenceSelection | null
  readonly time: number
}

const crowd = createCollection(
  localStorageCollectionOptions({
    id: 'shared-shapes-presence',
    storageKey: 'graph-docs-shared-shapes-presence',
    getKey: (seen: Seen) => seen.id,
  }),
)

await crowd.preload()
for (const seen of crowd.values()) {
  if (Date.now() - seen.time > 30_000) crowd.delete(seen.id)
}

const me = `visitor-${crypto.randomUUID().slice(0, 8)}`

function look(color: number): StateKindStyles {
  const stroke = `var(--graph-cat-${color})`
  return {
    nodes: { outline: stroke, outlineWidth: 3 },
    shapes: { stroke, strokeWidth: 4 },
  }
}

const definition = defineGraph({
  marks: [
    shapes(zones, { name: 'zones', color: 'tone', strokeWidth: 2 }),
    nodes(items, { x: 'x', y: 'y', size: 16 }),
  ],
  states: {
    saving: { opacity: 0.6 },
    presence1: look(1),
    presence2: look(2),
    presence3: look(3),
    presence4: look(4),
    presence5: look(5),
    presence6: look(6),
    presence7: look(7),
    presence8: look(8),
  },
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
          if (origin) draft.geometry = origin.geometry
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
    return persistShapes(editor, { collection: zones, live, pendingState: 'saving' }).stop
  }, [editor, live])
  return null
}

const zoneKeys = start.map((zone) => zone.id)

function Simulated() {
  useEffect(() => {
    const names = ['robot-1', 'robot-2', 'robot-3']
    const timer = setInterval(() => {
      const now = Date.now()
      names.forEach((name, index) => {
        const angle = now / 1500 + (index * Math.PI * 2) / names.length
        const pointer = { x: Math.cos(angle) * 220, y: Math.sin(angle * 1.3) * 170 }
        const zone = zoneKeys[(index + Math.floor(now / 3000)) % zoneKeys.length]
        const selection = { shapes: zone ? [zone] : [] }
        if (crowd.has(name)) {
          crowd.update(name, (draft) => {
            draft.pointer = pointer
            draft.selection = selection
            draft.time = now
          })
        } else {
          crowd.insert({ id: name, pointer, selection, time: now })
        }
      })
    }, 50)
    return () => {
      clearInterval(timer)
      const present = names.filter((name) => crowd.has(name))
      if (present.length > 0) crowd.delete(present)
    }
  }, [])
  return null
}

function Others({ presence }: { readonly presence: Presence<string> | null }) {
  const count = useSyncExternalStore(
    (notify) => presence?.store.subscribe(notify).unsubscribe ?? (() => {}),
    () => presence?.store.state.length ?? 0,
  )
  return (
    <span className="example-button shared-shapes-others" role="status">
      {messages.others(count)}
    </span>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [live, setLive] = useState(true)
  const [simulate, setSimulate] = useState(false)
  const [graph, setGraph] = useState<GraphInstance | null>(null)
  const [presence, setPresence] = useState<Presence<string> | null>(null)
  const attach = useCallback(
    (instance: GraphInstance | null) => {
      setGraph(instance)
      if (typeof ref === 'function') ref(instance)
      else if (ref) ref.current = instance
    },
    [ref],
  )
  useEffect(() => {
    if (!graph) return
    const shown = showPresence(graph, {
      collection: crowd,
      me,
      create: (id, values) => ({ id, ...values }),
    })
    setPresence(shown)
    return () => {
      shown.stop()
      setPresence(null)
    }
  }, [graph])
  return (
    <Graph
      ref={attach}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(start.length, items.length)}
    >
      <SharedEdits live={live} />
      {simulate ? <Simulated /> : null}
      <div className="example-actions">
        <label className="example-button shared-shapes-live">
          <input type="checkbox" checked={live} onChange={() => setLive((value) => !value)} />
          {messages.live}
        </label>
        <label className="example-button shared-shapes-live">
          <input
            type="checkbox"
            checked={simulate}
            onChange={() => setSimulate((value) => !value)}
          />
          {messages.simulate}
        </label>
        <button className="example-button" type="button" onClick={resetZones}>
          {messages.reset}
        </button>
        <Others presence={presence} />
      </div>
    </Graph>
  )
}
