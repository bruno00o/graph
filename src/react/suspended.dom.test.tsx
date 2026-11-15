import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import type { GraphSuspendEvent } from '../host/events'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { Graph, type GraphInstance } from './index'

const made = vi.hoisted(() => ({ count: 0, live: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => {
    made.count++
    made.live++
    return {
      ...fakeRenderer(),
      destroy: () => {
        made.live--
      },
    }
  },
}))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 50, y: 0 },
      ],
      { x: 'x', y: 'y' },
    ),
  ],
})

let dom: FakeDom
let root: Root
let graph: GraphInstance | null = null
let seen: GraphSuspendEvent[] = []

function render(suspended: boolean | undefined, keepFrame?: boolean): void {
  act(() => {
    root.render(
      <StrictMode>
        <Graph
          definition={definition}
          ariaLabel="graph"
          suspended={suspended}
          keepFrame={keepFrame}
          onSuspendChange={(event) => seen.push(event)}
          ref={(instance) => {
            graph = instance
          }}
        />
      </StrictMode>,
    )
  })
  dom.flushFrames()
}

beforeEach(() => {
  dom = installDom()
  made.count = 0
  made.live = 0
  graph = null
  seen = []
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  vi.restoreAllMocks()
  dom.restore()
})

describe('<Graph suspended>', () => {
  it('mounts without a context and takes one when the prop turns false', () => {
    render(true)
    expect(made.live).toBe(0)
    expect(graph?.store.state.suspended).toBe(true)
    render(false)
    expect(made.live).toBe(1)
    expect(graph?.store.state.suspended).toBe(false)
    expect(seen).toEqual([{ suspended: false }])
    render(true)
    expect(made.live).toBe(0)
    expect(seen).toEqual([{ suspended: false }, { suspended: true }])
  })

  it('leaves the suspension to the instance when the prop is left out', () => {
    render(undefined)
    expect(made.live).toBe(1)
    graph?.suspend()
    render(undefined)
    expect(made.live).toBe(0)
    expect(graph?.store.state.suspended).toBe(true)
  })

  it('keeps no copy of the last frame with keepFrame false, and follows the prop', () => {
    const original = HTMLCanvasElement.prototype.getContext
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
      options?: unknown,
    ) {
      if (kind === '2d' && this.width >= 800)
        return { drawImage: () => {} } as unknown as CanvasRenderingContext2D
      return original.call(this, kind as '2d', options as CanvasRenderingContext2DSettings)
    } as typeof HTMLCanvasElement.prototype.getContext)
    const frames = () => graph?.element.querySelectorAll('[data-graph-frame]').length
    render(false, false)
    render(true, false)
    expect(frames()).toBe(0)
    render(false, true)
    render(true, true)
    expect(frames()).toBe(1)
    render(true, false)
    expect(frames()).toBe(0)
  })
})
