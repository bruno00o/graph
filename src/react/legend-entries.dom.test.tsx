import { act, type ReactNode, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { LegendEntryGroup, LegendState } from '../legend/index'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { Graph, Legend, useLegend } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

interface Item {
  readonly id: string
  readonly weight: number
}

const data: Item[] = [
  { id: 'a', weight: 1 },
  { id: 'b', weight: 20 },
]

const definition = defineGraph({
  marks: [nodes<Item>(data)],
  states: { match: {} },
})

const heavy = (item: unknown) => (item as Item).weight > 10

const groups: readonly LegendEntryGroup[] = [
  {
    title: 'Weight',
    entries: [
      { id: 'heavy', label: 'Heavy', swatch: { kind: 'nodes', fill: 'red' }, nodes: heavy },
    ],
  },
]

let dom: FakeDom
let root: Root
let seen: LegendState | null = null

function Values({ entries }: { readonly entries: readonly LegendEntryGroup[] }) {
  seen = useLegend({ entries }).state
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

describe('legend entries in React', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    seen = null
    vi.useRealTimers()
    dom.restore()
  })

  it('renders the entries of <Legend> and reads them with useLegend', () => {
    render(
      <StrictMode>
        <Graph definition={definition} ariaLabel="graph">
          <Legend entries={groups} highlight="match" />
          <Values entries={groups} />
        </Graph>
      </StrictMode>,
    )
    const legend = document.querySelector('[data-graph-legend]')
    expect(legend?.textContent).toBe('WeightHeavy')
    expect(document.querySelectorAll('[data-graph-legend] [data-item="a:heavy"]')).toHaveLength(1)
    expect(seen?.entries[0]?.items[0]?.nodes).toBe(1)
  })

  it('does not read again when a render repeats the same entries', () => {
    const test = vi.fn(heavy)
    const make = (label: string): readonly LegendEntryGroup[] => [
      { entries: [{ id: 'heavy', label, swatch: { kind: 'nodes' }, nodes: test }] },
    ]
    const tree = (label: string) => (
      <Graph definition={definition} ariaLabel="graph">
        <Values entries={make(label)} />
      </Graph>
    )
    render(tree('Heavy'))
    const calls = test.mock.calls.length
    render(tree('Heavy'))
    expect(test.mock.calls.length).toBe(calls)
    render(tree('Very heavy'))
    expect(test.mock.calls.length).toBe(calls)
    expect(seen?.entries[0]?.items[0]?.label).toBe('Very heavy')
  })
})
