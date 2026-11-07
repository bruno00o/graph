import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { InteractionOptions, View } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

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
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

let dom: FakeDom

function mount(interaction: InteractionOptions = {}, initialView?: View): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
        interaction,
        layout: null,
      }),
      ariaLabel: 'graphe',
      initialView,
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function press(graph: GraphInstance, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  graph.element.dispatchEvent(event)
  dom.flushFrames()
  return event.defaultPrevented
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('keyboard and focus', () => {
  it('keeps the view still on the fit key when pan or zoom is off', () => {
    for (const interaction of [{ pan: false }, { zoom: false }]) {
      const graph = mount(interaction, { x: 500, y: 500, zoom: 4 })
      expect(press(graph, '0')).toBe(false)
      expect(graph.view.get()).toEqual({ x: 500, y: 500, zoom: 4 })
      graph.destroy()
    }
  })

  it('keeps the view still when the keyboard focus moves off screen with pan off', () => {
    const graph = mount({ pan: false, zoom: false }, { x: -100, y: 0, zoom: 4 })
    graph.focus.set({ kind: 'node', key: 'a' })
    dom.flushFrames()
    press(graph, 'ArrowRight')
    expect(graph.focus.get()?.key).not.toBe('a')
    expect(graph.view.get()).toEqual({ x: -100, y: 0, zoom: 4 })
    graph.focus.set(null)
    graph.focus.set({ kind: 'node', key: 'b' })
    dom.flushFrames()
    expect(graph.view.get().x).toBe(100)
    graph.destroy()
  })

  it('moves the focus once with focus.set after the element lost the DOM focus', () => {
    const graph = mount()
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.element.blur()
    graph.element.dispatchEvent(new FocusEvent('blur'))
    const seen: (string | null)[] = []
    graph.on('focuschange', ({ target }) => seen.push(target ? String(target.key) : null))
    graph.focus.set({ kind: 'node', key: 'b' })
    expect(seen).toEqual(['b'])
    graph.destroy()
  })

  it('moves the focus with the keyboard right after a mark leaves', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const first = nodes([{ id: 'a', x: 0, y: 0 }], { x: 'x', y: 'y' })
    const second = nodes([{ id: 'b', x: 100, y: 0 }], { x: 'x', y: 'y' })
    const graph = createGraphHost(
      container,
      { definition: defineGraph({ marks: [first, second] }), ariaLabel: 'graphe' },
      fakeRenderer,
    )
    dom.flushFrames()
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.update({ definition: defineGraph({ marks: [first] }) })
    expect(() => press(graph, 'ArrowRight')).not.toThrow()
    expect(graph.focus.get()?.key).toBe('a')
    graph.destroy()
  })

  it('writes its focus ring only when it changes, and keeps the theme', async () => {
    let themes = 0
    let palettes = 0
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({ marks: [nodes<Item>(items, { x: 'x', y: 'y' })] }),
        ariaLabel: 'graphe',
      },
      () => ({
        ...fakeRenderer(),
        setTheme: () => {
          themes++
        },
        setPalette: () => {
          palettes++
        },
      }),
    )
    dom.flushFrames()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const before = { themes, palettes }
    const style = graph.element.style
    let writes = 0
    const counted = new Proxy(style, {
      set: (target, name, value) => {
        if (name === 'outline') writes++
        return Reflect.set(target, name, value)
      },
    })
    Object.defineProperty(graph.element, 'style', { configurable: true, get: () => counted })
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.focus.set({ kind: 'node', key: 'b' })
    graph.element.dispatchEvent(new FocusEvent('blur'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    dom.flushFrames()
    expect(writes).toBe(0)
    expect({ themes, palettes }).toEqual(before)
    graph.destroy()
  })
})
