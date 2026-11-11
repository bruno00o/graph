import { defineGraph, type ElementKeys, edges, type Key, nodes, type View } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { Anchor, Graph, type GraphInstance, useGraphState } from '@bruno00o/graph/react'
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './linked.css'

const { items, links } = createCommunities(400, 600)
const start = items.reduce((best, item) => (item.weight > best.weight ? item : best)).id
const fitOptions = { padding: 72, maxZoom: 3, duration: 500 } as const

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [6, 18] } },
  layout: force(),
})

type Marks = (typeof definition.marks)[number]
type Instance = GraphInstance<never, Marks>

interface Drag {
  readonly x: number
  readonly y: number
  readonly view: View
}

const arrows: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function ViewFrame({ detail }: { readonly detail: Instance | null }) {
  const zoom = useGraphState((state) => state.view.zoom)
  const view = useGraphState((state) => state.view, { graph: detail })
  const width = useGraphState((state) => state.width, { graph: detail })
  const height = useGraphState((state) => state.height, { graph: detail })
  const drag = useRef<Drag | null>(null)
  if (!detail || !view || !width || !height) return null

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, view }
  }
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const from = drag.current
    if (!from) return
    detail.view.set({
      ...from.view,
      x: from.view.x + (event.clientX - from.x) / zoom,
      y: from.view.y + (event.clientY - from.y) / zoom,
    })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = arrows[event.key]
    if (!step) return
    event.preventDefault()
    detail.view.set({
      ...view,
      x: view.x + (step[0] * width * 0.1) / view.zoom,
      y: view.y + (step[1] * height * 0.1) / view.zoom,
    })
  }

  return (
    <Anchor point={{ x: view.x, y: view.y }} interactive>
      <button
        type="button"
        className="view-frame"
        aria-label={messages.frame}
        style={{ width: (width / view.zoom) * zoom, height: (height / view.zoom) * zoom }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onKeyDown={onKeyDown}
      />
    </Anchor>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [detail, setDetail] = useState<Instance | null>(null)
  const [selection, setSelection] = useState<ElementKeys>({ nodes: [start], edges: [] })

  const attach = useCallback(
    (instance: Instance | null) => {
      setDetail(instance)
      if (typeof ref === 'function') ref(instance)
      else if (ref) ref.current = instance
    },
    [ref],
  )

  const frame = useCallback(
    (keys: readonly Key[]) => {
      if (!detail || keys.length === 0) return
      const near = keys.flatMap((key) => [key, ...detail.neighbors(key)])
      detail.view.fit({ nodes: near, ...fitOptions })
    },
    [detail],
  )

  useEffect(() => {
    frame([start])
  }, [frame])

  return (
    <div className="linked-views">
      <Graph
        className="example-graph linked-overview"
        definition={definition}
        ariaLabel={messages.overviewLabel(items.length, links.length)}
        selection={selection}
        onSelectionChange={(event) => {
          setSelection(event.selection)
          frame(event.selection.nodes)
        }}
      >
        <span className="example-status">{messages.overview}</span>
        <ViewFrame detail={detail} />
      </Graph>
      <Graph
        ref={attach}
        className="example-graph"
        definition={definition}
        ariaLabel={messages.detailLabel(items.length, links.length)}
        selection={selection}
        onSelectionChange={(event) => setSelection(event.selection)}
      >
        <span className="example-status">{messages.detail}</span>
      </Graph>
    </div>
  )
}
