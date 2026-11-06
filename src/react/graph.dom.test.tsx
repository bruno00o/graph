import { useSelector } from '@tanstack/react-store'
import { shallow } from '@tanstack/store'
import { act, type ReactNode, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, View } from '../types'
import { Graph, type GraphInstance, useGraph, useGraphEvent, useGraphState } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

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

function Retagging() {
  const [tag, setTag] = useState('first')
  return (
    <Graph definition={definition()} ariaLabel="graphe">
      <Listener tag={tag} />
      <button type="button" onClick={() => setTag('second')} />
    </Graph>
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
    expect(second).toHaveBeenCalledWith({ nodes: ['a'], edges: [] })
  })

  it('updates the definition and the label in place', () => {
    render(<Graph definition={definition()} ariaLabel="un" ref={capture} />)
    const mounted = captured.graph
    render(<Graph definition={definition(['a', 'b', 'c'])} ariaLabel="deux" ref={capture} />)
    expect(captured.graph).toBe(mounted)
    expect(container.querySelector('[data-graph]')?.getAttribute('aria-label')).toBe('deux')
    expect(captured.graph?.positions.get('c')).toEqual({ x: 100, y: 0 })
  })

  it('removes the graph on unmount', () => {
    render(<Graph definition={definition()} ariaLabel="graphe" />)
    act(() => {
      root.render(null)
    })
    expect(container.querySelector('canvas')).toBeNull()
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
