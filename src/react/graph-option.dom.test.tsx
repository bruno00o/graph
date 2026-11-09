import { act, type ReactNode, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountGraph } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { NodeMark } from '../types'
import {
  Graph,
  type GraphInstance,
  Legend,
  Minimap,
  Timeline,
  useGraphEvent,
  useGraphState,
  useLegend,
  useTimeline,
} from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Item {
  readonly id: string
  readonly start: number
}

const items: Item[] = [
  { id: 'a', start: 0 },
  { id: 'b', start: 10 },
]

const definition = defineGraph({
  marks: [nodes(items, { name: 'items', time: (item) => item.start })],
  states: { match: {} },
})

type Marks = NodeMark<Item, 'items'>
type Instance = GraphInstance<'match', Marks>

let dom: FakeDom
let root: Root
let container: HTMLElement

function mount(): Instance {
  const host = document.createElement('div')
  document.body.append(host)
  return mountGraph(host, { definition, ariaLabel: 'graph' })
}

function render(element: ReactNode): void {
  act(() => {
    root.render(element)
  })
  act(() => {
    dom.flushFrames()
    vi.runOnlyPendingTimers()
  })
}

function text(): string | null | undefined {
  return container.querySelector('output')?.textContent
}

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
  dom.restore()
})

function Selected({
  graph,
  seen = () => {},
}: {
  readonly graph: Instance | null
  readonly seen?: (count: number | undefined) => void
}): ReactNode {
  const count = useGraphState((state) => state.selection.nodes.length, { graph })
  seen(count)
  return <output>{String(count)}</output>
}

let held: Instance | null = null

function Page(): ReactNode {
  const [graph, setGraph] = useState<Instance | null>(null)
  held = graph
  return (
    <>
      <Graph definition={definition} ariaLabel="graph" ref={setGraph} />
      <Selected graph={graph} />
    </>
  )
}

function Alone(): ReactNode {
  return <>{useGraphState((state) => state.width)}</>
}

describe('useGraphState with a graph option', () => {
  it('reads a graph outside of <Graph> and renders again when the slice changes', () => {
    const graph = mount()
    const seen = vi.fn()
    render(<Selected graph={graph} seen={seen} />)
    expect(text()).toBe('0')
    act(() => graph.selection.set({ nodes: ['a'] }))
    expect(text()).toBe('1')
    const renders = seen.mock.calls.length
    act(() => graph.selection.set({ nodes: ['a'] }))
    act(() => graph.view.set({ x: 5, y: 5, zoom: 2 }))
    expect(seen.mock.calls.length).toBe(renders)
    graph.destroy()
  })

  it('returns undefined while the graph is null, then reads it', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['a', 'b'] })
    render(<Selected graph={null} />)
    expect(text()).toBe('undefined')
    render(<Selected graph={graph} />)
    expect(text()).toBe('2')
    graph.destroy()
  })

  it('wins over the context', () => {
    const outside = mount()
    outside.selection.set({ nodes: ['a'] })
    render(
      <Graph definition={definition} ariaLabel="inner">
        <Selected graph={outside} />
      </Graph>,
    )
    expect(text()).toBe('1')
    outside.destroy()
  })

  it('follows a graph that changes, without keeping a subscription on the old one', () => {
    const first = mount()
    const second = mount()
    first.selection.set({ nodes: ['a'] })
    second.selection.set({ nodes: ['a', 'b'] })
    const subscribe = vi.spyOn(first.store, 'subscribe')
    render(<Selected graph={first} />)
    expect(text()).toBe('1')
    const subscription = subscribe.mock.results[0]?.value as { unsubscribe: () => void }
    const unsubscribe = vi.spyOn(subscription, 'unsubscribe')
    render(<Selected graph={second} />)
    expect(text()).toBe('2')
    expect(unsubscribe).toHaveBeenCalled()
    act(() => first.selection.clear())
    expect(text()).toBe('2')
    act(() => second.selection.clear())
    expect(text()).toBe('0')
    first.destroy()
    second.destroy()
  })

  it('keeps the last state of a destroyed graph and goes back to null', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['a'] })
    render(<Selected graph={graph} />)
    act(() => graph.destroy())
    render(<Selected graph={graph} />)
    expect(text()).toBe('1')
    render(<Selected graph={null} />)
    expect(text()).toBe('undefined')
  })

  it('stays correct under StrictMode with a graph that arrives after the first render', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['b'] })
    render(
      <StrictMode>
        <Selected graph={null} />
      </StrictMode>,
    )
    expect(text()).toBe('undefined')
    render(
      <StrictMode>
        <Selected graph={graph} />
      </StrictMode>,
    )
    expect(text()).toBe('1')
    act(() => graph.selection.set({ nodes: ['a', 'b'] }))
    expect(text()).toBe('2')
    graph.destroy()
  })

  it('works with the ref of <Graph> kept in state', () => {
    held = null
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    )
    const graph = held as Instance | null
    expect(graph).not.toBeNull()
    expect(text()).toBe('0')
    act(() => graph?.selection.set({ nodes: ['a'] }))
    expect(text()).toBe('1')
  })

  it('throws without a graph, naming the hook', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const alone = createRoot(document.createElement('div'))
    let message: string | null = null
    try {
      act(() => alone.render(<Alone />))
    } catch (error) {
      message = (error as Error).message
    } finally {
      act(() => alone.unmount())
    }
    expect(message).toBe('useGraphState: pass a graph, or use it inside <Graph> or <MapGraph>')
  })
})

function Listener({
  graph,
  handler,
}: {
  readonly graph: Instance | null
  readonly handler: (keys: readonly unknown[]) => void
}): null {
  useGraphEvent('selectionchange', ({ selection }) => handler(selection.nodes), { graph })
  return null
}

describe('useGraphEvent with a graph option', () => {
  it('subscribes once the graph exists, follows a change, and calls the latest handler', () => {
    const first = mount()
    const second = mount()
    const calls: string[] = []
    render(<Listener graph={null} handler={() => calls.push('none')} />)
    act(() => first.selection.set({ nodes: ['a'] }))
    expect(calls).toEqual([])
    render(<Listener graph={first} handler={() => calls.push('first')} />)
    act(() => first.selection.set({ nodes: ['b'] }))
    expect(calls).toEqual(['first'])
    render(<Listener graph={second} handler={() => calls.push('second')} />)
    act(() => first.selection.set({ nodes: ['a'] }))
    act(() => second.selection.set({ nodes: ['a'] }))
    expect(calls).toEqual(['first', 'second'])
    render(<Listener graph={null} handler={() => calls.push('none')} />)
    act(() => second.selection.set({ nodes: ['b'] }))
    expect(calls).toEqual(['first', 'second'])
    first.destroy()
    second.destroy()
  })

  it('does not subscribe twice under StrictMode', () => {
    const graph = mount()
    const calls: string[] = []
    render(
      <StrictMode>
        <Listener graph={graph} handler={() => calls.push('hit')} />
      </StrictMode>,
    )
    act(() => graph.selection.set({ nodes: ['a'] }))
    expect(calls).toEqual(['hit'])
    graph.destroy()
  })
})

function Companions({ graph }: { readonly graph: Instance | null }): ReactNode {
  const { state, legend } = useLegend({ graph })
  const { state: time, timeline } = useTimeline({ graph })
  return (
    <>
      <Minimap graph={graph} corner={null} />
      <Legend graph={graph} />
      <Timeline graph={graph} />
      <output>{`${legend === null}:${state.looks.length > 0}:${timeline === null}:${time.extent === null}`}</output>
    </>
  )
}

describe('a null graph in the companions', () => {
  it('draws nothing and keeps the state empty until a graph is given', () => {
    const graph = mount()
    render(<Companions graph={null} />)
    expect(container.querySelector('[data-graph-minimap]')).toBeNull()
    expect(container.querySelector('[data-graph-legend]')).toBeNull()
    expect(container.querySelector('[data-graph-timeline]')).toBeNull()
    expect(text()).toBe('true:false:true:true')
    render(<Companions graph={graph} />)
    expect(container.querySelector('[data-graph-minimap]')).not.toBeNull()
    expect(container.querySelector('[data-graph-legend]')).not.toBeNull()
    expect(container.querySelector('[data-graph-timeline]')).not.toBeNull()
    expect(text()).toBe('false:true:false:false')
    render(<Companions graph={null} />)
    expect(container.querySelector('[data-graph-timeline]')).toBeNull()
    graph.destroy()
  })
})
