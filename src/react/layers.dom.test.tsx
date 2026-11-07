import { act, StrictMode, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { Graph, type GraphInstance } from './index'

vi.mock('../webgl/renderer', () => ({ createWebglRenderer: () => fakeRenderer() }))

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const definition = defineGraph({
  marks: [
    nodes([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
    ]),
    edges([{ id: 'ab', from: 'a', to: 'b' }], { source: 'from', target: 'to', layer: 'lower' }),
    edges([{ id: 'ba', from: 'b', to: 'a' }], { source: 'from', target: 'to', layer: 'upper' }),
  ],
})

let dom: FakeDom
let root: Root
let graph: GraphInstance | null = null
let requests: string[][] = []
let changes: string[][] = []

function Layers() {
  const [hidden, setHidden] = useState<readonly ('lower' | 'upper')[]>(['upper'])
  return (
    <Graph
      definition={definition}
      ariaLabel="graph"
      hiddenLayers={hidden}
      onLayerChange={({ hidden: next }) => {
        requests.push([...next])
        setHidden(next)
      }}
      ref={(instance) => {
        graph = instance
      }}
    />
  )
}

describe('Graph layers', () => {
  beforeEach(() => {
    dom = installDom()
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    requests = []
    changes = []
  })

  afterEach(() => {
    act(() => root.unmount())
    graph = null
    dom.restore()
  })

  it('drives controlled hidden layers', () => {
    act(() => {
      root.render(
        <StrictMode>
          <Layers />
        </StrictMode>,
      )
    })
    expect(graph?.layers.hidden()).toEqual(['upper'])
    graph?.on('layerchange', ({ hidden }) => changes.push([...hidden]))
    act(() => graph?.layers.toggle('lower'))
    expect(requests).toEqual([['lower', 'upper']])
    expect(graph?.layers.hidden()).toEqual(['lower', 'upper'])
    expect(changes).toEqual([['lower', 'upper']])
  })

  it('reads the initial hidden layers once', () => {
    act(() => {
      root.render(
        <Graph
          definition={definition}
          ariaLabel="graph"
          initialHiddenLayers={['lower']}
          ref={(instance) => {
            graph = instance
          }}
        />,
      )
    })
    expect(graph?.layers.hidden()).toEqual(['lower'])
    act(() => graph?.layers.show())
    expect(graph?.layers.hidden()).toEqual([])
  })
})
