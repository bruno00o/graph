import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { ThemeResolver } from '../dom/theme'
import { mountMapGraph } from '../map'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { Renderer, RendererContext, RenderFrame, RenderInput } from './renderer'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

interface Made {
  readonly syncs: RenderInput[]
  readonly frames: RenderFrame[]
  themes: number
  palettes: number
  destroyed: boolean
}

interface Handle extends RendererContext {
  restores: number
  loses: number
  gone: boolean
}

let dom: FakeDom
let made: Made[] = []
let handles: Handle[] = []

function definition(list: readonly Item[] = items) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(list, { x: 'x', y: 'y' }),
    ],
    layout: null,
  })
}

function factory(withContext: boolean) {
  return (): Renderer => {
    const record: Made = { syncs: [], frames: [], themes: 0, palettes: 0, destroyed: false }
    made.push(record)
    const renderer: Renderer = {
      ...fakeRenderer(),
      sync: (input) => {
        record.syncs.push(input)
      },
      setTheme: () => {
        record.themes++
      },
      setPalette: () => {
        record.palettes++
      },
      render: (frame) => {
        record.frames.push(frame)
        return -1
      },
      destroy: () => {
        record.destroyed = true
      },
    }
    if (withContext) {
      renderer.suspend = () => {
        renderer.destroy()
        const handle: Handle = {
          restores: 0,
          loses: 0,
          gone: false,
          lost: () => handle.gone,
          restore: () => {
            handle.restores++
          },
          lose: () => {
            handle.loses++
            handle.gone = true
          },
        }
        handles.push(handle)
        return handle
      }
    }
    return renderer
  }
}

function mount(options: { suspended?: boolean; context?: boolean; keepFrame?: boolean } = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: definition(),
      ariaLabel: 'graph',
      suspended: options.suspended,
      keepFrame: options.keepFrame,
    },
    factory(options.context === true),
  )
  dom.flushFrames()
  return graph as GraphInstance
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function lose(canvas: HTMLCanvasElement): Event {
  const event = new Event('webglcontextlost', { cancelable: true })
  canvas.dispatchEvent(event)
  return event
}

function keptImage(graph: GraphInstance): HTMLCanvasElement | null {
  return graph.element.querySelector('canvas[data-graph-frame]')
}

let copies = 0

beforeEach(() => {
  dom = installDom(800, 600)
  made = []
  handles = []
  copies = 0
  const original = HTMLCanvasElement.prototype.getContext
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
    options?: unknown,
  ) {
    if (kind === '2d' && this.width >= 800) {
      return {
        drawImage: () => {
          copies++
        },
      } as unknown as CanvasRenderingContext2D
    }
    return original.call(this, kind as '2d', options as CanvasRenderingContext2DSettings)
  } as typeof HTMLCanvasElement.prototype.getContext)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
})

describe('suspend and resume', () => {
  it('draws a last frame, frees the renderer and hides the canvas', () => {
    const graph = mount()
    const first = made[0] as Made
    const drawn = first.frames.length
    const seen: boolean[] = []
    graph.on('suspendchange', (event) => seen.push(event.suspended))
    graph.suspend()
    expect(first.frames.length).toBe(drawn + 1)
    expect(first.destroyed).toBe(true)
    expect(graph.store.state.suspended).toBe(true)
    expect(seen).toEqual([true])
    expect(canvasOf(graph).style.visibility).toBe('hidden')
    graph.suspend()
    expect(seen).toEqual([true])
    expect(made).toHaveLength(1)
  })

  it('keeps applying data and moves while suspended, and draws them once resumed', async () => {
    const graph = mount()
    graph.suspend()
    graph.update({
      definition: definition([...items, { id: 'c', x: 0, y: 200 }]),
    })
    graph.view.set({ x: 40, y: 0, zoom: 2 })
    graph.selection.set({ nodes: ['a'] })
    dom.flushFrames()
    expect(graph.count().nodes).toBe(3)
    expect(graph.positions.get('c')).toEqual({ x: 0, y: 200 })
    expect(graph.store.state.view).toEqual({ x: 40, y: 0, zoom: 2 })
    expect(made).toHaveLength(1)
    const drawn = graph.drawn()
    let resolved = false
    void drawn.then(() => {
      resolved = true
    })
    dom.flushFrames()
    await Promise.resolve()
    expect(resolved).toBe(false)
    const seen: boolean[] = []
    graph.on('suspendchange', (event) => seen.push(event.suspended))
    graph.resume()
    expect(seen).toEqual([false])
    expect(graph.store.state.suspended).toBe(false)
    const second = made[1] as Made
    expect(second).toBeDefined()
    expect(second.themes).toBeGreaterThan(0)
    expect(second.palettes).toBeGreaterThan(0)
    dom.flushFrames()
    await drawn
    expect(second.syncs[0]?.full).toBe(true)
    expect(second.syncs[0]?.positionsChanged).toBe(true)
    expect(second.frames.at(-1)?.view).toEqual({ x: 40, y: 0, zoom: 2 })
    expect(graph.selection.get().nodes).toEqual(['a'])
    expect(canvasOf(graph).style.visibility).toBe('')
    graph.resume()
    expect(seen).toEqual([false])
  })

  it('shows the last frame while suspended and drops it after the first frame drawn again', () => {
    const graph = mount()
    graph.suspend()
    expect(copies).toBe(1)
    const image = keptImage(graph)
    expect(image).not.toBeNull()
    expect(image?.getAttribute('aria-hidden')).toBe('true')
    expect(image?.style.width).toBe('800px')
    dom.resize(500, 401)
    expect(image?.style.left).toBe('-150px')
    expect(image?.style.top).toBe('-99px')
    graph.resume()
    expect(keptImage(graph)).not.toBeNull()
    dom.flushFrames()
    expect(keptImage(graph)).toBeNull()
  })

  it('keeps the last frame until the theme changes while suspended', async () => {
    const graph = mount()
    graph.suspend()
    expect(keptImage(graph)).not.toBeNull()
    const container = graph.element.parentElement as HTMLElement
    container.classList.add('plain')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(keptImage(graph)).not.toBeNull()
    const theme = ThemeResolver.prototype.theme
    vi.spyOn(ThemeResolver.prototype, 'theme').mockImplementation(function (this: ThemeResolver) {
      return { ...theme.call(this), font: 'serif' }
    })
    container.classList.add('dark')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(keptImage(graph)).toBeNull()
  })

  it('mounts without a renderer and creates one on resume', () => {
    const graph = mount({ suspended: true })
    expect(made).toHaveLength(0)
    expect(graph.store.state.suspended).toBe(true)
    expect(graph.count().nodes).toBe(2)
    expect(canvasOf(graph).style.visibility).toBe('hidden')
    graph.resume()
    dom.flushFrames()
    expect(made).toHaveLength(1)
    expect((made[0] as Made).frames.length).toBeGreaterThan(0)
    expect(canvasOf(graph).style.visibility).toBe('')
  })

  it('ends a drag and clears the hover when it suspends', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    const at = graph.view.toScreen({ x: -100, y: 0 })
    const event = { clientX: at.x, clientY: at.y, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointermove', event))
    dom.flushFrames()
    expect(graph.store.state.hovered?.key).toBe('a')
    canvas.dispatchEvent(new PointerEvent('pointerdown', event))
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: at.x + 30 }))
    const ends: string[] = []
    graph.on('dragend', (drag) => ends.push(String(drag.target.key)))
    graph.suspend()
    expect(ends).toEqual(['a'])
    expect(graph.store.state.hovered).toBeNull()
  })

  it('gives the context back to the browser and asks for it again', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    graph.suspend()
    const handle = handles[0] as Handle
    expect(lose(canvas).defaultPrevented).toBe(true)
    graph.resume()
    expect(handle.restores).toBe(1)
    expect(made).toHaveLength(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
    dom.flushFrames()
    expect((made[1] as Made).frames.length).toBeGreaterThan(0)
    expect(canvasOf(graph).style.visibility).toBe('')
  })

  it('waits for the loss before it restores when resumed at once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    graph.suspend()
    graph.resume()
    const handle = handles[0] as Handle
    expect(handle.restores).toBe(0)
    lose(canvas)
    expect(handle.restores).toBe(0)
    vi.runAllTimers()
    expect(handle.restores).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
  })

  it('gives a context back at once when it returns after a new suspension', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    graph.suspend()
    lose(canvas)
    graph.resume()
    graph.suspend()
    const handle = handles[0] as Handle
    expect(handle.restores).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(handle.loses).toBe(1)
    expect(made).toHaveLength(1)
    lose(canvas)
    graph.resume()
    expect(handle.restores).toBe(2)
  })

  it('still recovers from a real context loss after a resume', () => {
    const graph = mount()
    graph.suspend()
    graph.resume()
    dom.flushFrames()
    const canvas = canvasOf(graph)
    lose(canvas)
    expect((made[1] as Made).destroyed).toBe(true)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    dom.flushFrames()
    expect(made).toHaveLength(3)
    expect((made[2] as Made).frames.length).toBeGreaterThan(0)
  })

  it('keeps no copy of the last frame when told not to', () => {
    const graph = mount({ keepFrame: false })
    const first = made[0] as Made
    const drawn = first.frames.length
    graph.suspend()
    expect(copies).toBe(0)
    expect(keptImage(graph)).toBeNull()
    expect(first.frames.length).toBe(drawn)
    expect(first.destroyed).toBe(true)
    expect(canvasOf(graph).style.visibility).toBe('hidden')
    expect(graph.store.state.suspended).toBe(true)
    graph.resume()
    dom.flushFrames()
    expect((made[1] as Made).frames.length).toBeGreaterThan(0)
    expect(canvasOf(graph).style.visibility).toBe('')
  })

  it('changes whether the last frame is kept with update', () => {
    const graph = mount()
    graph.update({ keepFrame: false })
    graph.suspend()
    expect(keptImage(graph)).toBeNull()
    graph.resume()
    dom.flushFrames()
    graph.update({ keepFrame: true })
    graph.suspend()
    expect(keptImage(graph)).not.toBeNull()
    graph.update({ keepFrame: false })
    expect(keptImage(graph)).toBeNull()
    graph.update({})
    graph.resume()
    dom.flushFrames()
    expect(keptImage(graph)).toBeNull()
  })

  it('suspends without drawing when called while a frame is drawn', () => {
    const graph = mount({ keepFrame: false })
    graph.on('viewchange', () => graph.suspend())
    graph.view.set({ x: 3, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(graph.store.state.suspended).toBe(true)
    expect(copies).toBe(0)
  })

  it('lets a handler resume during the suspension', () => {
    const graph = mount()
    graph.on('suspendchange', (event) => {
      if (event.suspended) graph.resume()
    })
    graph.suspend()
    expect(graph.store.state.suspended).toBe(false)
    expect((made[0] as Made).destroyed).toBe(false)
    expect(canvasOf(graph).style.visibility).toBe('')
  })

  it('does nothing once destroyed', () => {
    const graph = mount()
    graph.destroy()
    graph.suspend()
    graph.resume()
    expect(graph.store.state.suspended).toBe(false)
  })

  it('keeps drawing on a map', () => {
    const { map, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'map' })
    render()
    graph.suspend()
    expect(graph.store.state.suspended).toBe(true)
    expect(graph.drawsOnMap).toBe(true)
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    render()
    graph.resume()
    expect(graph.store.state.suspended).toBe(false)
    graph.destroy()
  })

  it('suspends without keeping the first frame of a graph mounted suspended', () => {
    const graph = mount({ suspended: true, keepFrame: false })
    expect(keptImage(graph)).toBeNull()
    expect(copies).toBe(0)
    graph.resume()
    dom.flushFrames()
    expect(made).toHaveLength(1)
  })
})

describe('a context the browser takes away', () => {
  it('hides the canvas until a frame is drawn again', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    expect(canvas.style.visibility).toBe('')
    lose(canvas)
    expect(canvas.style.visibility).toBe('hidden')
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(canvas.style.visibility).toBe('hidden')
    dom.flushFrames()
    expect(canvas.style.visibility).toBe('')
  })

  it('shows the canvas again once resume brings the context back', () => {
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    const handle = (() => {
      lose(canvas)
      const made = handles.at(-1) as Handle
      made.gone = true
      return made
    })()
    expect(canvas.style.visibility).toBe('hidden')
    graph.resume()
    expect(handle.restores).toBe(1)
    handle.gone = false
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    dom.flushFrames()
    expect(canvas.style.visibility).toBe('')
  })

  it('does not take suspended in update', () => {
    const graph = mount()
    // @ts-expect-error
    graph.update({ suspended: true })
    expect(graph.store.state.suspended).toBe(false)
  })

  function evict(graph: GraphInstance): Handle {
    const canvas = canvasOf(graph)
    lose(canvas)
    const handle = handles.at(-1) as Handle
    handle.gone = true
    return handle
  }

  it('comes back with resume, without being suspended', () => {
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    const handle = evict(graph)
    expect((made[0] as Made).destroyed).toBe(true)
    expect(graph.store.state.suspended).toBe(false)
    const seen: boolean[] = []
    graph.on('suspendchange', (event) => seen.push(event.suspended))
    graph.resume()
    expect(handle.restores).toBe(1)
    graph.resume()
    expect(handle.restores).toBe(1)
    handle.gone = false
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
    dom.flushFrames()
    expect((made[1] as Made).frames.length).toBeGreaterThan(0)
    expect((made[1] as Made).syncs[0]?.full).toBe(true)
    expect(seen).toEqual([])
  })

  it('asks for nothing when the context is there', () => {
    const graph = mount({ context: true })
    graph.resume()
    graph.resume()
    expect(made).toHaveLength(1)
    expect(handles).toHaveLength(0)
    expect((made[0] as Made).destroyed).toBe(false)
  })

  it('is valid to suspend, and resume brings it back', () => {
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    const handle = evict(graph)
    graph.suspend()
    expect(graph.store.state.suspended).toBe(true)
    expect(keptImage(graph)).toBeNull()
    expect(canvas.style.visibility).toBe('hidden')
    graph.resume()
    expect(handle.restores).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
    dom.flushFrames()
    expect(canvas.style.visibility).toBe('')
    expect((made[1] as Made).frames.length).toBeGreaterThan(0)
  })

  it('gives the context back when the browser restores it during a suspension', () => {
    const graph = mount({ context: true })
    const canvas = canvasOf(graph)
    const handle = evict(graph)
    graph.suspend()
    handle.gone = false
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(handle.loses).toBe(1)
    expect(made).toHaveLength(1)
    lose(canvas)
    graph.resume()
    expect(handle.restores).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
  })

  it('waits for the browser when the renderer gives no way to restore', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    lose(canvas)
    graph.resume()
    expect(made).toHaveLength(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(2)
  })

  it('does not ask twice while a restore is pending', () => {
    const graph = mount({ context: true })
    const handle = evict(graph)
    graph.resume()
    graph.suspend()
    graph.resume()
    expect(handle.restores).toBe(1)
  })

  it('creates a renderer again when the context is there and the first try failed', () => {
    let failing = true
    const graph = createGraphHost(
      document.body.appendChild(document.createElement('div')),
      { definition: definition(), ariaLabel: 'graph' },
      () => {
        if (made.length > 0 && failing) {
          failing = false
          throw new Error('no context')
        }
        return factory(true)()
      },
    ) as GraphInstance
    dom.flushFrames()
    const canvas = canvasOf(graph)
    const handle = evict(graph)
    handle.gone = false
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made).toHaveLength(1)
    graph.resume()
    expect(made).toHaveLength(2)
  })
})
