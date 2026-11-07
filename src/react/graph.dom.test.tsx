import { useSelector } from '@tanstack/react-store'
import { shallow } from '@tanstack/store'
import { act, type ReactNode, StrictMode, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { ElementKeys } from '../host/events'
import type { RenderInput } from '../host/renderer'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, TimeWindowInput, View } from '../types'
import { Graph, type GraphInstance, useGraph, useGraphEvent, useGraphState } from './index'

const written = vi.hoisted(() => ({ nodes: 0, edges: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => ({
    ...fakeRenderer(),
    sync: (input: RenderInput) => {
      written.nodes += input.dirty.nodes.size
      written.edges += input.dirty.edges.size
    },
  }),
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function definition(ids: readonly string[] = ['a', 'b']): GraphDefinition {
  return defineGraph({
    marks: [
      nodes(
        ids.map((id, index) => ({ id, x: index * 50, y: 0 })),
        { x: 'x', y: 'y' },
      ),
    ],
  })
}

const captured: { graph: GraphInstance | null; seen: string[]; renders: number[] } = {
  graph: null,
  seen: [],
  renders: [],
}

function capture(instance: GraphInstance | null): void {
  captured.graph = instance
}

function Size() {
  const width = useGraphState((state) => state.width)
  return <output>{width}</output>
}

function Selection() {
  captured.graph = useGraph()
  const count = useGraphState((state) => state.selection.nodes.length)
  captured.renders.push(count)
  return <output>{count}</output>
}

function Counts() {
  captured.graph = useGraph()
  const counts = useGraphState(
    (state) => ({ nodes: state.selection.nodes.length, edges: state.selection.edges.length }),
    { compare: shallow },
  )
  captured.renders.push(counts.nodes)
  return null
}

function StoreSelection() {
  const graph = useGraph()
  const count = useSelector(graph.store, (state) => state.selection.nodes.length)
  const view = useSelector(graph.store, (state) => state.view)
  expectTypeOf(view).toEqualTypeOf<View>()
  captured.graph = graph
  captured.renders.push(count)
  return null
}

function Listener({ tag }: { readonly tag: string }) {
  captured.graph = useGraph()
  useGraphEvent('viewchange', () => captured.seen.push(tag))
  return null
}

const stableDefinition = definition()

function Controlled() {
  const [selection, setSelection] = useState<ElementKeys>({ nodes: [], edges: [] })
  return (
    <Graph
      definition={stableDefinition}
      ariaLabel="graphe"
      ref={capture}
      selection={selection}
      onSelectionChange={({ selection: next }) => {
        captured.seen.push(next.nodes.join())
        setSelection(next)
      }}
    />
  )
}

function ControlledView({ follow }: { readonly follow: boolean }) {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  return (
    <Graph
      definition={stableDefinition}
      ariaLabel="graphe"
      ref={capture}
      view={view}
      onViewChange={(event) => {
        captured.seen.push(`${event.view.x},${event.view.zoom}`)
        if (follow) setView(event.view)
      }}
    />
  )
}

const bump = { render: () => {} }

function BusyView() {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 })
  const [, setTick] = useState(0)
  bump.render = () => setTick((tick) => tick + 1)
  return (
    <Graph
      definition={stableDefinition}
      ariaLabel="graphe"
      ref={capture}
      view={view}
      onViewChange={(event) => setView(event.view)}
      selection={{ nodes: [] }}
    />
  )
}

const timed = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0, at: 5 },
        { id: 'b', x: 50, y: 0, at: 10 },
      ],
      { x: 'x', y: 'y', time: 'at' },
    ),
  ],
})

function TimeFromEffect() {
  const [time, setTime] = useState<TimeWindowInput | null>(null)
  const [graph, setGraph] = useState<GraphInstance | null>(null)
  useEffect(() => {
    graph?.time.set({ start: 0, end: 7 })
  }, [graph])
  return (
    <Graph
      definition={timed}
      ariaLabel="graphe"
      ref={setGraph}
      time={time}
      onTimeChange={(event) => setTime(event.window)}
    >
      <Grab />
    </Graph>
  )
}

function Grab() {
  captured.graph = useGraph()
  return null
}

function Retagging() {
  const [tag, setTag] = useState('first')
  return (
    <Graph definition={definition()} ariaLabel="graphe">
      <Listener tag={tag} />
      <button type="button" onClick={() => setTag('second')} />
    </Graph>
  )
}

const people = [
  { id: 'a', team: 'red' },
  { id: 'b', team: 'blue' },
]
const ties = [{ id: 'ab', from: 'a', to: 'b' }]

function Inline() {
  return (
    <Graph
      definition={defineGraph({
        marks: [
          edges(ties, { source: 'from', target: 'to', width: undefined, label: undefined }),
          nodes(people, { color: 'team', size: undefined, label: undefined }),
        ],
        states: { muted: { opacity: 0.3, halo: undefined }, selected: { raise: undefined } },
        layout: grid({ columns: undefined, spacing: undefined }),
        interaction: { lasso: undefined, zoom: { speed: undefined } },
        view: { minZoom: undefined },
      })}
      ariaLabel="graphe"
      ref={capture}
      selection={undefined}
      view={undefined}
      onClick={undefined}
    />
  )
}

function Outside() {
  useGraph()
  return null
}

let dom: FakeDom
let root: Root
let container: HTMLElement

function render(element: ReactNode): void {
  act(() => {
    root.render(element)
  })
  act(() => {
    dom.flushFrames()
  })
}

beforeEach(() => {
  captured.graph = null
  captured.seen = []
  captured.renders = []
  dom = installDom()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  dom.restore()
})

describe('<Graph>', () => {
  it('mounts once under StrictMode and gives overlays the graph', () => {
    render(
      <StrictMode>
        <Graph definition={definition()} ariaLabel="graphe" className="frame">
          <Size />
        </Graph>
      </StrictMode>,
    )
    expect(container.querySelectorAll('canvas')).toHaveLength(1)
    expect(container.querySelector('[data-graph]')?.getAttribute('aria-label')).toBe('graphe')
    expect(container.querySelector('.frame output')?.textContent).toBe('800')
  })

  it('exposes the host through ref and calls the latest event props', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stable = definition()
    render(<Graph definition={stable} ariaLabel="graphe" ref={capture} onSelectionChange={first} />)
    render(
      <Graph definition={stable} ariaLabel="graphe" ref={capture} onSelectionChange={second} />,
    )
    act(() => {
      captured.graph?.selection.set({ nodes: ['a'] })
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith({ selection: { nodes: ['a'], edges: [] } })
  })

  it('listens to pointermove only while onPointerMove is given', () => {
    const stable = definition()
    const moves: unknown[] = []
    render(
      <Graph
        definition={stable}
        ariaLabel="graphe"
        ref={capture}
        onPointerMove={({ target }) => moves.push(target?.key ?? null)}
      />,
    )
    const canvas = container.querySelector('canvas')
    const move = (x: number) =>
      act(() => {
        canvas?.dispatchEvent(
          new PointerEvent('pointermove', { clientX: x, clientY: 5, bubbles: true }),
        )
        dom.flushFrames()
      })
    move(5)
    expect(moves).toEqual([null])
    render(<Graph definition={stable} ariaLabel="graphe" ref={capture} />)
    move(6)
    expect(moves).toEqual([null])
    expect(dom.pendingFrames()).toBe(0)
  })

  it('updates the definition and the label in place', () => {
    render(<Graph definition={definition()} ariaLabel="un" ref={capture} />)
    const mounted = captured.graph
    render(<Graph definition={definition(['a', 'b', 'c'])} ariaLabel="deux" ref={capture} />)
    expect(captured.graph).toBe(mounted)
    expect(container.querySelector('[data-graph]')?.getAttribute('aria-label')).toBe('deux')
    expect(captured.graph?.positions.get('c')).toEqual({ x: 100, y: 0 })
  })

  it('rewrites nothing when rendered again with an identical inline definition', async () => {
    render(<Inline />)
    await act(async () => {})
    act(() => {
      dom.flushFrames()
    })
    const starts: string[] = []
    captured.graph?.on('layoutstart', () => starts.push('start'))
    written.nodes = 0
    written.edges = 0
    render(<Inline />)
    render(<Inline />)
    await act(async () => {})
    expect(written).toEqual({ nodes: 0, edges: 0 })
    expect(starts).toEqual([])
  })

  it('removes the graph on unmount', () => {
    render(<Graph definition={definition()} ariaLabel="graphe" />)
    act(() => {
      root.render(null)
    })
    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('controlled selection', () => {
  it('follows the selection prop updated from onSelectionChange', () => {
    render(<Controlled />)
    act(() => {
      captured.graph?.selection.set({ nodes: ['a', 'b'] })
    })
    expect(captured.graph?.selection.get().nodes).toEqual(['a', 'b'])
    expect(captured.seen).toEqual(['a,b'])
  })

  it('keeps the prop when the parent ignores the change', () => {
    const onSelectionChange = vi.fn()
    const view = () => (
      <Graph
        definition={stableDefinition}
        ariaLabel="graphe"
        ref={capture}
        selection={{ nodes: ['b'] }}
        onSelectionChange={onSelectionChange}
      />
    )
    render(view())
    act(() => {
      captured.graph?.selection.set({ nodes: ['a'] })
    })
    render(view())
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith({ selection: { nodes: ['a'], edges: [] } })
    expect(captured.graph?.selection.get().nodes).toEqual(['b'])
  })
})

describe('controlled view', () => {
  it('draws the view set in onViewChange within the frame of the request', () => {
    render(<ControlledView follow />)
    const drawn: View[] = []
    captured.graph?.on('viewchange', ({ view }) => drawn.push(view))
    act(() => {
      captured.graph?.view.set({ x: 40, y: 0, zoom: 2 })
    })
    expect(captured.graph?.view.get()).toEqual({ x: 0, y: 0, zoom: 1 })
    act(() => {
      dom.flushFrames()
    })
    expect(captured.seen).toEqual(['40,2'])
    expect(drawn).toEqual([{ x: 40, y: 0, zoom: 2 }])
    expect(captured.graph?.view.get()).toEqual({ x: 40, y: 0, zoom: 2 })
  })

  it('does not lose a pan step when the parent renders for another reason', () => {
    render(<BusyView />)
    const canvas = container.querySelector('canvas')
    const send = (type: string, x: number) =>
      canvas?.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: 500,
          button: 0,
          pointerId: 1,
          bubbles: true,
        }),
      )
    act(() => {
      send('pointerdown', 400)
      send('pointermove', 450)
    })
    act(() => bump.render())
    act(() => dom.flushFrames())
    act(() => send('pointerup', 450))
    expect(captured.graph?.view.get()).toEqual({ x: -50, y: 0, zoom: 1 })
  })

  it('keeps the prop when the parent ignores the request', () => {
    render(<ControlledView follow={false} />)
    act(() => {
      captured.graph?.view.zoomBy(2)
    })
    act(() => {
      dom.flushFrames()
    })
    expect(captured.seen).toEqual(['0,2'])
    expect(captured.graph?.view.get()).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})

describe('controlled time', () => {
  it('takes a window asked from an effect without a warning from React', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      root.render(<TimeFromEffect />)
    })
    expect(captured.graph?.time.get()).toEqual({ start: 0, end: 7 })
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})

describe('hooks', () => {
  it('re-renders selectors only when the selected value changes', () => {
    render(
      <Graph definition={definition()} ariaLabel="graphe">
        <Selection />
      </Graph>,
    )
    const before = captured.renders.length
    act(() => {
      captured.graph?.view.set({ x: 10, y: 0, zoom: 2 })
    })
    expect(captured.renders.length).toBe(before)
    act(() => {
      captured.graph?.selection.set({ nodes: ['a', 'b'] })
    })
    expect(captured.renders.at(-1)).toBe(2)
  })

  it('keeps a selected object while compare finds it equal', () => {
    render(
      <Graph definition={definition()} ariaLabel="graphe">
        <Counts />
      </Graph>,
    )
    const before = captured.renders.length
    act(() => {
      captured.graph?.view.set({ x: 10, y: 0, zoom: 2 })
    })
    expect(captured.renders.length).toBe(before)
  })

  it('works with useSelector from @tanstack/react-store', () => {
    render(
      <Graph definition={definition()} ariaLabel="graphe">
        <StoreSelection />
      </Graph>,
    )
    act(() => {
      captured.graph?.selection.set({ nodes: ['a', 'b'] })
    })
    expect(captured.renders.at(-1)).toBe(2)
  })

  it('listens to graph events with the latest handler', () => {
    render(<Retagging />)
    act(() => {
      container.querySelector('button')?.click()
    })
    act(() => {
      captured.graph?.view.set({ x: 1, y: 1, zoom: 1 })
    })
    expect(captured.seen.at(-1)).toBe('second')
  })

  it('refuses hooks outside <Graph>', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Outside />)).toThrow('inside <Graph>')
  })
})
