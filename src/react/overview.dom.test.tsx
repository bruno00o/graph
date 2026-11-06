import { act, type ReactNode, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { LegendState } from '../legend/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { Graph, type GraphInstance, Legend, Minimap, useLegend } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0, group: 'north' },
        { id: 'b', x: 100, y: 0, group: 'south' },
      ],
      { x: 'x', y: 'y', color: 'group' },
    ),
  ],
  states: { match: {} },
})

let dom: FakeDom
let root: Root
let container: HTMLElement
let graph: GraphInstance | null = null
let seen: LegendState | null = null

function Values() {
  const { state } = useLegend({ highlight: 'match' })
  seen = state
  return null
}

function Overview({ corner }: { readonly corner: 'topLeft' | null }) {
  return (
    <Graph
      definition={definition}
      ariaLabel="graph"
      ref={(instance) => {
        graph = instance
      }}
    >
      <Minimap corner={corner} width={120} />
      <Legend titles={{ color: 'Group' }} highlight="match" />
      <Values />
    </Graph>
  )
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

describe('Minimap and Legend', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    graph = null
    seen = null
    vi.useRealTimers()
    dom.restore()
  })

  it('mount once under StrictMode and follow their props', () => {
    render(
      <StrictMode>
        <Overview corner="topLeft" />
      </StrictMode>,
    )
    expect(document.querySelectorAll('[data-graph-minimap]')).toHaveLength(1)
    expect(document.querySelector('[data-graph-minimap]')?.parentElement).toBe(graph?.element)
    expect(document.querySelectorAll('[data-graph-legend]')).toHaveLength(1)
    const buttons = [...document.querySelectorAll('[data-graph-legend] button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['north', 'south'])
    expect(seen?.color?.type).toBe('categories')
    render(
      <StrictMode>
        <Overview corner={null} />
      </StrictMode>,
    )
    const minimap = document.querySelector('[data-graph-minimap]') as HTMLElement
    expect(minimap.parentElement?.parentElement).toBe(container.firstElementChild)
    expect(minimap.style.width).toBe('120px')
  })

  it('remove their elements on unmount', () => {
    render(<Overview corner="topLeft" />)
    act(() => root.render(null))
    expect(document.querySelector('[data-graph-minimap]')).toBeNull()
    expect(document.querySelector('[data-graph-legend]')).toBeNull()
  })
})
