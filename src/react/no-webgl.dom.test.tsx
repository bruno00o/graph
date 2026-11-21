import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, installDom } from '../testing/dom'
import { Graph, type GraphInstance, useGraphState } from './index'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 60, y: 0 },
      ],
      { x: 'x', y: 'y' },
    ),
  ],
})

let dom: FakeDom
let root: Root
let host: HTMLDivElement

function Status() {
  const drawable = useGraphState((state) => state.drawable)
  return <p data-drawable={String(drawable)} />
}

beforeEach(() => {
  dom = installDom()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
  dom.restore()
})

describe('<Graph> without WebGL2', () => {
  it('mounts, tells the children it draws nothing and picks on the CPU', () => {
    let graph: GraphInstance | null = null
    act(() => {
      root.render(
        <StrictMode>
          <Graph
            definition={definition}
            ariaLabel="graph"
            initialView={{ x: 30, y: 0, zoom: 1 }}
            ref={(instance) => {
              graph = instance
            }}
          >
            <Status />
          </Graph>
        </StrictMode>,
      )
    })
    dom.flushFrames()
    const mounted = graph as GraphInstance | null
    if (!mounted) throw new Error('no graph')
    expect(host.querySelector('[data-drawable]')?.getAttribute('data-drawable')).toBe('false')
    const at = mounted.view.toScreen({ x: 60, y: 0 })
    expect(mounted.pick(at)).toMatchObject({ kind: 'node', key: 'b' })
  })
})
