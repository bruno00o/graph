import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { internalsOf } from './internals'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'cd', from: 'c', to: 'd' },
]

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(items)],
        layout: null,
      }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as GraphInstance
}

async function settle(): Promise<void> {
  for (let round = 0; round < 6; round++) {
    dom.flushFrames()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function lose(graph: GraphInstance): void {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
}

async function finished(run: Promise<boolean>): Promise<string> {
  const outcome = run.then((done) => `done ${done}`)
  await settle()
  return Promise.race([outcome, Promise.resolve('pending')])
}

describe('the work of the host while the browser holds its context', () => {
  it('finishes a layout that glides while suspended', async () => {
    const graph = mount()
    await settle()
    graph.suspend()
    expect(await finished(graph.layout.run(grid(), { duration: 100 }))).toBe('done true')
    graph.destroy()
  })

  it('finishes a layout that glides while its context is lost', async () => {
    const graph = mount()
    await settle()
    lose(graph)
    expect(await finished(graph.layout.run(grid(), { duration: 100 }))).toBe('done true')
    graph.destroy()
  })

  it('reaches the view asked with a duration while its context is lost', async () => {
    const graph = mount()
    await settle()
    lose(graph)
    graph.view.set({ x: 50, y: 60, zoom: 2 }, { duration: 100 })
    await settle()
    expect(graph.view.get()).toEqual({ x: 50, y: 60, zoom: 2 })
    graph.destroy()
  })

  it('tells its companions about each frame while its context is lost', async () => {
    const graph = mount()
    await settle()
    lose(graph)
    let frames = 0
    internalsOf(graph, 'test').watch({ frame: () => frames++, destroy: () => {} })
    graph.view.set({ x: 50, y: 60, zoom: 2 }, { duration: 100 })
    await settle()
    expect(frames).toBeGreaterThan(0)
    graph.destroy()
  })

  it('keeps graph.drawn() waiting until its context comes back', async () => {
    const graph = mount()
    await settle()
    lose(graph)
    let drawn = false
    graph.drawn().then(() => {
      drawn = true
    })
    graph.view.set({ x: 50, y: 60, zoom: 2 }, { duration: 100 })
    await settle()
    expect(drawn).toBe(false)
    const canvas = graph.element.querySelector('canvas')
    canvas?.dispatchEvent(new Event('webglcontextrestored'))
    await settle()
    expect(drawn).toBe(true)
    graph.destroy()
  })
})
