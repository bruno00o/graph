import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import { exportMapPng, mountMapGraph } from '.'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Hidden {
  removed: boolean
  readonly container: HTMLElement
}

const hiddenMaps: Hidden[] = []

class HiddenMap {
  readonly #record: Hidden
  readonly #canvas = document.createElement('canvas')
  constructor(options: { container: HTMLElement }) {
    this.#record = { removed: false, container: options.container }
    hiddenMaps.push(this.#record)
  }
  on(name: string, listener: () => void): void {
    if (name === 'idle') setTimeout(listener, 50)
  }
  off(): void {}
  isStyleLoaded(): boolean {
    return true
  }
  getCanvas(): HTMLCanvasElement {
    return this.#canvas
  }
  getStyle() {
    return { sources: {}, layers: [] }
  }
  getSource() {
    return undefined
  }
  remove(): void {
    this.#record.removed = true
  }
}

class BrokenMap {
  constructor() {
    throw new Error('no map')
  }
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
  hiddenMaps.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

function mount(prototype: object) {
  const { map } = fakeMap()
  Object.setPrototypeOf(map, prototype)
  Object.assign(map, {
    getStyle: () => ({ version: 8, sources: {}, layers: [] }),
    getSource: () => undefined,
  })
  return mountMapGraph(map, {
    definition: defineGraph({
      marks: [
        nodes([{ id: 'a', longitude: 2, latitude: 48 }], {
          longitude: 'longitude',
          latitude: 'latitude',
        }),
      ],
      layout: null,
    }),
    ariaLabel: 'map',
  })
}

const leftovers = () => document.body.querySelectorAll('div[aria-hidden="true"][style*="fixed"]')

describe('exportMapPng failures', () => {
  it('removes the offscreen map as soon as the graph image fails', async () => {
    const graph = mount(HiddenMap.prototype)
    await expect(exportMapPng(graph)).rejects.toThrow('graph: WebGL2 is not available')
    expect(hiddenMaps).toHaveLength(1)
    expect(hiddenMaps[0]?.removed).toBe(true)
    expect(hiddenMaps[0]?.container.isConnected).toBe(false)
    expect(leftovers()).toHaveLength(0)
    graph.destroy()
  })

  it('removes the offscreen container when the map cannot be made', async () => {
    const graph = mount(BrokenMap.prototype)
    await expect(exportMapPng(graph)).rejects.toThrow()
    expect(leftovers()).toHaveLength(0)
    graph.destroy()
  })
})
