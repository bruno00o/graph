import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost } from './mount-graph'
import type { Renderer, RenderInput } from './renderer'

interface Item {
  readonly id: string
}

const items: Item[] = [{ id: 'alpha' }, { id: 'b' }]

interface Face {
  readonly family: string
  status: string
}

class FakeFonts extends EventTarget {
  status = 'loaded'
  ready: Promise<void> = Promise.resolve()
  readonly faces: Face[] = []
  #done: () => void = () => {};

  [Symbol.iterator](): Iterator<Face> {
    return this.faces[Symbol.iterator]()
  }

  begin(family: string): Face {
    const face = { family, status: 'loading' }
    this.faces.push(face)
    if (this.status !== 'loading') {
      this.status = 'loading'
      this.ready = new Promise((resolve) => {
        this.#done = resolve
      })
    }
    this.dispatchEvent(new Event('loading'))
    return face
  }

  async finish(face: Face): Promise<void> {
    face.status = 'loaded'
    this.status = 'loaded'
    this.#done()
    await this.ready
    await Promise.resolve()
  }
}

let dom: FakeDom
let fonts: FakeFonts
let advance = 12
let measured = 0

class FakeCanvas {
  getContext() {
    return {
      font: '',
      measureText: () => {
        measured++
        return { width: advance }
      },
    }
  }
}

function mount(font?: string) {
  const container = document.createElement('div')
  document.body.append(container)
  const inputs: RenderInput[] = []
  const reloads: (ReadonlySet<string> | null)[] = []
  const renderer: Renderer = {
    ...fakeRenderer(),
    sync: (input) => {
      inputs.push(input)
    },
    reloadFonts: (families) => {
      reloads.push(families)
      return families?.has('late sans') ?? true
    },
  }
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes<Item>(items, {
            shape: 'box',
            size: 20,
            label: font ? { text: 'id', font } : 'id',
            x: () => 0,
            y: () => 0,
          }),
        ],
      }),
      ariaLabel: 'graph',
    },
    () => renderer,
  )
  dom.flushFrames()
  const width = (index: number) => inputs.at(-1)?.scene.nodes.width[index] ?? Number.NaN
  return { graph, width, reloads, inputs }
}

beforeEach(() => {
  dom = installDom()
  fonts = new FakeFonts()
  Object.defineProperty(document, 'fonts', { value: fonts, configurable: true })
  vi.stubGlobal('OffscreenCanvas', FakeCanvas)
  advance = 12
  measured = 0
})

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts')
  dom.restore()
})

describe('web fonts that load late', () => {
  it('measures the boxes again and tells the renderer when a used family loads', async () => {
    const { graph, width, reloads } = mount('Late Sans, sans-serif')
    const before = width(0)
    expect(before).toBeGreaterThan(20)
    const face = fonts.begin('"Late Sans"')
    advance = 24
    await fonts.finish(face)
    dom.flushFrames()
    expect(reloads).toHaveLength(1)
    expect(width(0)).toBeGreaterThan(before)
    graph.destroy()
  })

  it('does nothing when the family that loads is not in use', async () => {
    const { graph, width, reloads } = mount('Late Sans, sans-serif')
    const before = width(0)
    const frames = dom.pendingFrames()
    const counted = measured
    const face = fonts.begin('Other')
    advance = 24
    await fonts.finish(face)
    expect(reloads).toHaveLength(1)
    expect(width(0)).toBe(before)
    expect(measured).toBe(counted)
    expect(dom.pendingFrames()).toBe(frames)
    graph.destroy()
  })

  it('does not look at the fonts while none loads', () => {
    const { graph, reloads } = mount('Late Sans, sans-serif')
    dom.flushFrames()
    expect(reloads).toHaveLength(0)
    expect(measured).toBeGreaterThan(0)
    const counted = measured
    dom.flushFrames()
    expect(measured).toBe(counted)
    graph.destroy()
  })

  it('catches a font already loading when the graph mounts', async () => {
    const face = fonts.begin('Late Sans')
    const { graph, width } = mount('Late Sans, sans-serif')
    const before = width(0)
    advance = 24
    await fonts.finish(face)
    dom.flushFrames()
    expect(width(0)).toBeGreaterThan(before)
    graph.destroy()
  })

  it('stops listening once destroyed', async () => {
    const remove = vi.spyOn(fonts, 'removeEventListener')
    const add = vi.spyOn(fonts, 'addEventListener')
    const { graph, reloads } = mount('Late Sans')
    expect(add).toHaveBeenCalledWith('loading', expect.any(Function))
    const face = fonts.begin('Late Sans')
    graph.destroy()
    expect(remove).toHaveBeenCalledWith('loading', add.mock.calls[0]?.[1])
    await fonts.finish(face)
    expect(reloads).toHaveLength(0)
  })

  it('mounts without the font loading API', () => {
    Reflect.deleteProperty(document, 'fonts')
    const { graph } = mount()
    expect(() => graph.destroy()).not.toThrow()
  })
})
