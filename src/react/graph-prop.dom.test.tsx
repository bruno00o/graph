import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountGraph } from '../host/mount-graph'
import type { LegendState } from '../legend/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimelineState } from '../timeline/index'
import type { NodeMark } from '../types'
import { type GraphInstance, Legend, Minimap, Timeline, useLegend, useTimeline } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly group: string
  readonly start: number
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0, group: 'north', start: 0 },
  { id: 'b', x: 100, y: 0, group: 'south', start: 10 },
]

const definition = defineGraph({
  marks: [
    nodes(items, { name: 'items', x: 'x', y: 'y', color: 'group', time: (item) => item.start }),
  ],
  states: { match: {} },
})

type Marks = NodeMark<Item, 'items'>

let dom: FakeDom
let root: Root
let container: HTMLElement
let legendState: LegendState<Marks> | null = null
let timelineState: TimelineState | null = null

function mount(): GraphInstance<'match', Marks> {
  const host = document.createElement('div')
  document.body.append(host)
  return mountGraph(host, { definition, ariaLabel: 'graph' })
}

function Reader({ graph }: { readonly graph: GraphInstance<'match', Marks> }) {
  const { state } = useLegend({ graph, highlight: 'match' })
  expectTypeOf(state).toEqualTypeOf<LegendState<Marks>>()
  legendState = state
  timelineState = useTimeline({ graph, bins: 10 }).state
  return null
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

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  legendState = null
  timelineState = null
})

afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
  dom.restore()
})

describe('the graph prop', () => {
  it('lets the minimap, the legend and the timeline follow a graph mounted elsewhere', () => {
    const graph = mount()
    render(
      <>
        <Minimap graph={graph} corner={null} />
        <Legend graph={graph} highlight="match" />
        <Timeline graph={graph} />
        <Reader graph={graph} />
      </>,
    )
    expect(container.querySelector('[data-graph-minimap]')).not.toBeNull()
    expect(container.querySelector('[data-graph-legend]')).not.toBeNull()
    expect(container.querySelector('[data-graph-timeline]')).not.toBeNull()
    expect(legendState?.color?.type).toBe('categories')
    expect(timelineState?.extent).not.toBeNull()
    act(() => root.render(null))
    expect(container.childElementCount).toBe(0)
    graph.destroy()
  })

  it('follows another graph when the prop changes', () => {
    const first = mount()
    const second = mount()
    render(<Timeline graph={first} />)
    const bar = container.querySelector('[data-graph-timeline]')
    render(<Timeline graph={second} />)
    expect(container.querySelectorAll('[data-graph-timeline]')).toHaveLength(1)
    expect(container.querySelector('[data-graph-timeline]')).not.toBe(bar)
    first.destroy()
    second.destroy()
  })

  it('throws a clear error without a graph', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = (element: ReactNode) => {
      const alone = createRoot(document.createElement('div'))
      try {
        act(() => alone.render(element))
        return null
      } catch (error) {
        return (error as Error).message
      } finally {
        act(() => alone.unmount())
      }
    }
    expect(failure(<Timeline />)).toBe(
      'Timeline: pass a graph, or use it inside <Graph> or <MapGraph>',
    )
    expect(failure(<Legend />)).toBe('Legend: pass a graph, or use it inside <Graph> or <MapGraph>')
    expect(failure(<Minimap />)).toBe(
      'Minimap: pass a graph, or use it inside <Graph> or <MapGraph>',
    )
  })
})
