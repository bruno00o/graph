import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportPng, exportSvg } from '../export'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost, type GraphInstance, mountGraph } from './mount-graph'
import type { Renderer } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const definition = defineGraph({
  marks: [
    edges([{ id: 'ab', from: 'a', to: 'b' }], { source: 'from', target: 'to' }),
    nodes<Item>(
      [
        { id: 'a', x: -100, y: 0 },
        { id: 'b', x: 100, y: 0 },
      ],
      { x: 'x', y: 'y' },
    ),
  ],
})

let dom: FakeDom

function container(): HTMLDivElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function click(graph: GraphInstance, key: string): void {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  const at = graph.view.toScreen(position)
  for (const type of ['pointerdown', 'pointerup']) {
    canvasOf(graph).dispatchEvent(
      new PointerEvent(type, {
        clientX: at.x,
        clientY: at.y,
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    )
  }
}

function refusing(answers: boolean[], made: Renderer[]) {
  return (): Renderer => {
    if (answers.shift() === false) {
      throw new DOMException('graph: WebGL2 is not available', 'NotSupportedError')
    }
    const renderer = fakeRenderer()
    made.push(renderer)
    return renderer
  }
}

beforeEach(() => {
  dom = installDom()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('a graph mounted without WebGL2', () => {
  it('mounts without throwing, reads drawable false and warns once', () => {
    const first = mountGraph(container(), { definition, ariaLabel: 'graph' })
    const second = mountGraph(container(), { definition, ariaLabel: 'graph' })
    dom.flushFrames()
    expect(first.store.state.drawable).toBe(false)
    expect(second.store.state.drawable).toBe(false)
    expect(first.store.state.suspended).toBe(false)
    const warnings = vi
      .mocked(console.warn)
      .mock.calls.filter(([message]) => String(message).includes('WebGL2 is not available'))
    expect(warnings).toHaveLength(1)
    expect(canvasOf(first).style.visibility).toBe('')
    first.destroy()
    second.destroy()
  })

  it('picks, selects and moves the view on the CPU', () => {
    const graph = mountGraph(container(), {
      definition,
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    })
    dom.flushFrames()
    const at = graph.view.toScreen({ x: 100, y: 0 })
    expect(graph.pick(at)).toMatchObject({ kind: 'node', key: 'b' })
    click(graph, 'a')
    expect(graph.selection.get().nodes).toEqual(['a'])
    graph.view.set({ x: 10, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(graph.view.get()).toEqual({ x: 10, y: 0, zoom: 2 })
    graph.destroy()
  })

  it('resolves drawn instead of waiting for a frame', async () => {
    const graph = mountGraph(container(), { definition, ariaLabel: 'graph' })
    const drawn = graph.drawn()
    dom.flushFrames()
    await expect(drawn).resolves.toBeUndefined()
    const later = graph.drawn()
    dom.flushFrames()
    await expect(later).resolves.toBeUndefined()
    graph.destroy()
  })

  it('exports SVG and rejects PNG with a NotSupportedError', async () => {
    const graph = mountGraph(container(), { definition, ariaLabel: 'graph' })
    dom.flushFrames()
    await expect(exportSvg(graph)).resolves.toContain('<svg')
    await expect(exportPng(graph)).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: expect.stringContaining('exportPng needs WebGL2'),
    })
    graph.destroy()
  })

  it('suspends and resumes without throwing', () => {
    const graph = mountGraph(container(), { definition, ariaLabel: 'graph' })
    dom.flushFrames()
    graph.suspend()
    expect(graph.store.state.suspended).toBe(true)
    graph.resume()
    dom.flushFrames()
    expect(graph.store.state).toMatchObject({ suspended: false, drawable: false })
    expect(canvasOf(graph).style.visibility).toBe('')
    graph.destroy()
  })
})

describe('a renderer that cannot be made', () => {
  it('tries once more on resume and draws once it is made', async () => {
    const made: Renderer[] = []
    const graph = createGraphHost(
      container(),
      { definition, ariaLabel: 'graph' },
      refusing([false, true], made),
    )
    dom.flushFrames()
    expect(graph.store.state.drawable).toBe(false)
    expect(made).toHaveLength(0)
    graph.resume()
    expect(graph.store.state.drawable).toBe(true)
    expect(made).toHaveLength(1)
    const drawn = graph.drawn()
    dom.flushFrames()
    await expect(drawn).resolves.toBeUndefined()
    graph.destroy()
  })

  it('reads drawable false once a graph mounted suspended cannot resume', async () => {
    const made: Renderer[] = []
    const graph = createGraphHost(
      container(),
      { definition, ariaLabel: 'graph', suspended: true },
      refusing([false], made),
    )
    dom.flushFrames()
    expect(graph.store.state.drawable).toBe(true)
    expect(canvasOf(graph).style.visibility).toBe('hidden')
    graph.resume()
    expect(graph.store.state).toMatchObject({ suspended: false, drawable: false })
    expect(canvasOf(graph).style.visibility).toBe('')
    const drawn = graph.drawn()
    dom.flushFrames()
    await expect(drawn).resolves.toBeUndefined()
    graph.destroy()
  })

  it('leaves a graph that draws as it was', () => {
    const made: Renderer[] = []
    const graph = createGraphHost(
      container(),
      { definition, ariaLabel: 'graph' },
      refusing([true], made),
    )
    dom.flushFrames()
    expect(graph.store.state.drawable).toBe(true)
    expect(console.warn).not.toHaveBeenCalled()
    graph.resume()
    expect(made).toHaveLength(1)
    graph.destroy()
  })
})
