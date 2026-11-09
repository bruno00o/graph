import { type JSX, useRef } from 'react'
import { describe, expectTypeOf, it } from 'vitest'
import { defineGraph } from '../define-graph'
import type { GraphPointerEvent, NodeTarget } from '../host/events'
import type { Legend as LegendInstance, LegendState } from '../legend/index'
import { edges, nodes } from '../marks'
import type { EdgeMark, NodeMark } from '../types'
import {
  Graph,
  type GraphInstance,
  type GraphProps,
  type GraphState,
  useGraph,
  useGraphEvent,
  useGraphState,
  useLegend,
} from './index'

type Item = { id: string; label: string; weight: number }
type Group = { id: string; title: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const groups: Group[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { name: 'item', label: 'label' }),
    nodes(groups, { name: 'group', label: 'title' }),
  ],
  states: { muted: { opacity: 0.2 } },
})

type Marks = (typeof definition.marks)[number]

function Events(): JSX.Element {
  return (
    <Graph
      definition={definition}
      ariaLabel="graph"
      onClick={({ target }) => {
        if (target?.kind === 'node' && target.mark === 'item') {
          expectTypeOf(target.datum).toEqualTypeOf<Item>()
        }
        if (target?.kind === 'edge') expectTypeOf(target.datum).toEqualTypeOf<Link>()
      }}
      onDragEnd={({ target }) => {
        expectTypeOf(target.datum).toEqualTypeOf<Item | Group>()
      }}
      onFocusChange={({ target }) => {
        // @ts-expect-error
        if (target?.mark === 'other') return
      }}
    />
  )
}

function TypedRef(): JSX.Element {
  const graph = useRef<GraphInstance<'muted', Marks> | null>(null)
  return <Graph ref={graph} definition={definition} ariaLabel="graph" />
}

function UntypedRef(): JSX.Element {
  const graph = useRef<GraphInstance | null>(null)
  return (
    <Graph
      ref={graph}
      definition={definition}
      ariaLabel="graph"
      onClick={({ target }) => {
        if (target?.kind === 'edge') expectTypeOf(target.datum).toEqualTypeOf<Link>()
      }}
    />
  )
}

function CallbackRef(): JSX.Element {
  return (
    <Graph
      ref={(graph) => {
        expectTypeOf(graph).toEqualTypeOf<GraphInstance<'muted', Marks> | null>()
      }}
      definition={definition}
      ariaLabel="graph"
    />
  )
}

function Overlay(): null {
  const graph = useGraph<'muted', Marks>()
  expectTypeOf(graph).toEqualTypeOf<GraphInstance<'muted', Marks>>()
  expectTypeOf(useGraph()).toEqualTypeOf<GraphInstance>()
  const hovered = useGraphState((state: GraphState<'muted', Marks>) => state.hovered)
  if (hovered?.kind === 'node' && hovered.mark === 'group') {
    expectTypeOf(hovered.datum).toEqualTypeOf<Group>()
  }
  expectTypeOf(useGraphState((state) => state.width)).toEqualTypeOf<number>()
  expectTypeOf(useGraphState((state) => state.focused)?.datum).toBeUnknown()
  useGraphEvent('click', (event: GraphPointerEvent<Marks>) => {
    if (event.target?.kind === 'node' && event.target.mark === 'item') {
      expectTypeOf(event.target.datum).toEqualTypeOf<Item>()
    }
  })
  useGraphEvent('dragstart', ({ target }) => {
    expectTypeOf(target).toEqualTypeOf<NodeTarget>()
  })
  // @ts-expect-error
  useGraphEvent('viewchange', (event: GraphPointerEvent<Marks>) => event.point)
  return null
}

type Typed = GraphInstance<'muted', Marks>

function Outside({ graph, maybe }: { readonly graph: Typed; readonly maybe: Typed | null }): null {
  const hovered = useGraphState((state) => state.hovered, { graph })
  if (hovered?.kind === 'node' && hovered.mark === 'group') {
    expectTypeOf(hovered.datum).toEqualTypeOf<Group>()
  }
  if (hovered?.kind === 'edge') expectTypeOf(hovered.datum).toEqualTypeOf<Link>()
  expectTypeOf(useGraphState((state) => state.states.muted.nodes, { graph })).toEqualTypeOf<
    readonly (string | number)[]
  >()
  // @ts-expect-error
  useGraphState((state) => state.states.other, { graph })
  const counted = useGraphState((state) => state.selection.nodes.length, { graph: maybe })
  expectTypeOf(counted).toEqualTypeOf<number | undefined>()
  const kept = useGraphState((state) => [state.width, state.height], {
    graph,
    compare: (a, b) => a[0] === b[0],
  })
  expectTypeOf(kept).toEqualTypeOf<number[]>()
  const plain: GraphInstance = useGraph()
  expectTypeOf(useGraphState((state) => state.width, { graph: plain })).toEqualTypeOf<number>()
  expectTypeOf(
    useGraphState((state) => state.width, { compare: Object.is }),
  ).toEqualTypeOf<number>()
  useGraphEvent(
    'click',
    (event) => {
      expectTypeOf(event).toEqualTypeOf<GraphPointerEvent<Marks>>()
      if (event.target?.kind === 'node' && event.target.mark === 'item') {
        expectTypeOf(event.target.datum).toEqualTypeOf<Item>()
      }
    },
    { graph },
  )
  useGraphEvent('click', (event) => expectTypeOf(event).toEqualTypeOf<GraphPointerEvent<Marks>>(), {
    graph: maybe,
  })
  useGraphEvent(
    'click',
    (event) => {
      // @ts-expect-error
      if (event.target?.mark === 'other') return
    },
    { graph },
  )
  useGraphEvent('viewchange', (event) => expectTypeOf(event.view.zoom).toBeNumber(), { graph })
  const { state, legend } = useLegend({ graph: maybe })
  expectTypeOf(state).toEqualTypeOf<LegendState<Marks>>()
  expectTypeOf(legend).toEqualTypeOf<LegendInstance<'muted', Marks> | null>()
  return null
}

describe('typed React adapter', () => {
  it('types the event props of <Graph> from the definition', () => {
    expectTypeOf(Events).returns.toEqualTypeOf<JSX.Element>()
    expectTypeOf<Parameters<typeof Graph<'muted', Marks>>[0]>().toEqualTypeOf<
      GraphProps<'muted', Marks>
    >()
  })

  it('types the ref of <Graph>, and accepts an untyped ref object', () => {
    expectTypeOf(TypedRef).toBeFunction()
    expectTypeOf(UntypedRef).toBeFunction()
    expectTypeOf(CallbackRef).toBeFunction()
  })

  it('types the hooks from the graph option', () => {
    expectTypeOf(Outside).toBeFunction()
  })

  it('types the hooks from type arguments or annotations', () => {
    expectTypeOf(Overlay).toBeFunction()
    expectTypeOf<NodeMark<Item, 'item'>>().toExtend<Marks>()
    expectTypeOf<EdgeMark<Link, undefined>>().toExtend<Marks>()
  })
})
