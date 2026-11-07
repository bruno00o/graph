import {
  defineGraph,
  type EdgeMark,
  edges,
  type GraphPointerEvent,
  type NodeMark,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import {
  Graph,
  type GraphInstance,
  type GraphState,
  useGraphEvent,
  useGraphState,
} from '@bruno00o/graph/react'
import { type ReactNode, type Ref, useRef, useState } from 'react'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './stats.css'

type Marks = NodeMark<Item> | EdgeMark<Link>

const { items, links } = createCommunities(300, 480, 43)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [14, 34] } },
  layout: force(),
  interaction: { lasso: true },
})

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const renders = useRef(0)
  renders.current += 1
  return (
    <section>
      <h2>
        {title}
        <small>{messages.renders(renders.current)}</small>
      </h2>
      <dl>{children}</dl>
    </section>
  )
}

function Row({ name, value }: { readonly name: string; readonly value: string }) {
  return (
    <>
      <dt>{name}</dt>
      <dd>{value}</dd>
    </>
  )
}

function ViewStats() {
  const view = useGraphState((state) => state.view)
  const width = useGraphState((state) => state.width)
  const height = useGraphState((state) => state.height)
  return (
    <Section title={messages.view}>
      <Row name={messages.zoom} value={messages.zoomValue(view.zoom)} />
      <Row name={messages.center} value={messages.point(view.x, view.y)} />
      <Row name={messages.size} value={messages.pixels(width, height)} />
    </Section>
  )
}

function PointerStats() {
  const hovered = useGraphState((state: GraphState<string, Marks>) => state.hovered)
  const [clicked, setClicked] = useState<Point | null>(null)
  useGraphEvent('click', ({ world }: GraphPointerEvent<Marks>) => setClicked(world))
  const name =
    hovered?.kind === 'node' ? hovered.datum.label : hovered ? messages.edge : messages.none
  return (
    <Section title={messages.pointer}>
      <Row name={messages.hovered} value={name} />
      <Row
        name={messages.clicked}
        value={clicked ? messages.point(clicked.x, clicked.y) : messages.none}
      />
    </Section>
  )
}

function SelectionStats() {
  const selection = useGraphState((state) => state.selection)
  return (
    <Section title={messages.selection}>
      <Row name={messages.nodes} value={messages.count(selection.nodes.length)} />
      <Row name={messages.edges} value={messages.count(selection.edges.length)} />
    </Section>
  )
}

function LayoutStats() {
  const layout = useGraphState((state) => state.layout)
  const moves = useGraphState((state) => state.positionsVersion)
  return (
    <Section title={messages.layout}>
      <Row
        name={messages.status}
        value={layout.running ? messages.progress(layout.progress) : messages.idle}
      />
      <Row name={messages.moves} value={messages.count(moves)} />
    </Section>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel}
    >
      <aside className="stats-panel" aria-label={messages.panelLabel}>
        <ViewStats />
        <PointerStats />
        <SelectionStats />
        <LayoutStats />
      </aside>
    </Graph>
  )
}
