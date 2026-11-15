import { act, type ReactNode, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimelineState } from '../timeline/index'
import type { TimeWindowInput } from '../types'
import { Graph, type GraphInstance, Timeline, useTimeline } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0, start: 0, end: 10 },
        { id: 'b', x: 100, y: 0, start: 5, end: 20 },
      ],
      { x: 'x', y: 'y', time: (item) => ({ start: item.start, end: item.end }) },
    ),
  ],
})

let dom: FakeDom
let root: Root
let container: HTMLElement
let graph: GraphInstance | null = null
let seen: TimelineState | null = null
let requests = 0

function Values() {
  const { state } = useTimeline({ bins: 20 })
  seen = state
  return null
}

function Frise({ initial }: { readonly initial: TimeWindowInput | null }) {
  const [time, setTime] = useState(initial)
  return (
    <Graph
      definition={definition}
      ariaLabel="graph"
      time={time}
      onTimeChange={({ window }) => {
        requests++
        setTime(window)
      }}
      ref={(instance) => {
        graph = instance
      }}
    >
      <Timeline bins={20} labels={{ play: 'Lecture' }} />
      <Values />
    </Graph>
  )
}

interface Change {
  readonly at: number
  readonly type: string
}

const changes: Change[] = [
  { at: 0, type: 'added' },
  { at: 4, type: 'changed' },
  { at: 8, type: 'added' },
]
let found: readonly Change[] = []
let shown: TimelineState['window'] = null

function Replay({ alone }: { readonly alone: boolean }) {
  const { state, timeline } = useTimeline({
    graph: alone ? false : undefined,
    events: changes,
    eventTime: 'at',
    eventKind: 'type',
    instant: true,
  })
  shown = state.window
  found = state.window && timeline ? timeline.events(state.window.start ?? 0) : []
  return <Timeline timeline={timeline} labels={{ cursor: 'Moment' }} />
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

describe('Timeline', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    requests = 0
  })

  afterEach(() => {
    act(() => root.unmount())
    graph = null
    seen = null
    vi.useRealTimers()
    dom.restore()
  })

  it('mounts once under StrictMode and drives a controlled window', async () => {
    render(
      <StrictMode>
        <Frise initial={{ start: 0, end: 5 }} />
      </StrictMode>,
    )
    expect(document.querySelectorAll('[data-graph-timeline]')).toHaveLength(1)
    expect(seen?.extent).toEqual({ start: 0, end: 20 })
    expect(seen?.window).toEqual({ start: 0, end: 5 })
    const end = document.querySelector<HTMLElement>('[data-graph-timeline] [data-part=end]')
    await act(async () => {
      end?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(requests).toBe(1)
    expect(graph?.time.get()?.end).toBeGreaterThan(5)
    expect(seen?.window).toEqual(graph?.time.get())
  })

  it('returns a prop that goes away to its default', () => {
    const bar = (mode?: 'grow') => (
      <Graph definition={definition} ariaLabel="graph">
        {mode ? <Timeline mode={mode} labels={{ play: 'Lecture' }} /> : <Timeline />}
        <Values />
      </Graph>
    )
    render(bar('grow'))
    const button = document.querySelector('[data-graph-timeline] button')
    expect(button?.getAttribute('aria-label')).toBe('Lecture')
    render(bar())
    expect(button?.getAttribute('aria-label')).toBeNull()
  })

  it('renders a timeline of events made by useTimeline, with or without a graph', () => {
    render(
      <StrictMode>
        <Graph
          definition={definition}
          ariaLabel="graph"
          ref={(instance) => {
            graph = instance
          }}
        >
          <Replay alone={false} />
        </Graph>
      </StrictMode>,
    )
    expect(document.querySelectorAll('[data-graph-timeline]')).toHaveLength(1)
    const cursor = document.querySelector<HTMLElement>('[data-graph-timeline] [data-part=cursor]')
    expect(cursor?.getAttribute('aria-label')).toBe('Moment')
    act(() => {
      cursor?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      )
    })
    expect(graph?.time.get()).toEqual({ start: 0, end: 0 })
    expect(found.map((change) => change.type)).toEqual(['added'])
    render(<Replay alone />)
    const alone = document.querySelector<HTMLElement>('[data-graph-timeline] [data-part=cursor]')
    act(() => {
      alone?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
      )
    })
    expect(shown).toEqual({ start: 8, end: 8 })
    expect(found).toEqual([changes[2]])
  })

  it('removes its element on unmount', () => {
    render(<Frise initial={null} />)
    act(() => root.render(null))
    expect(document.querySelector('[data-graph-timeline]')).toBeNull()
  })
})
