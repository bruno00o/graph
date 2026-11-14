import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { type FakeMap, fakeMap } from '../testing/map'
import type { GraphDefinition, ShapeGeometry } from '../types'
import { internalsOf } from './internals'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { PointerTool, ToolPointer } from './pointer-tool'

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

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [{ id: 'bc', from: 'b', to: 'c' }]
const zones: Zone[] = [{ id: 'z', geometry: { x: -250, y: -200, width: 100, height: 100 } }]

let dom: FakeDom

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function definition(): GraphDefinition {
  return defineGraph({
    marks: [
      shapes(zones),
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    interaction: { lasso: true, keyboard: true },
  }) as GraphDefinition
}

interface ToolLog {
  readonly calls: string[]
  readonly tool: PointerTool
}

function spyTool(
  take: (pointer: ToolPointer) => boolean,
  keys: readonly string[] = [],
  cursor: string | null = 'move',
): ToolLog {
  const calls: string[] = []
  const name = (pointer: ToolPointer) =>
    pointer.hit ? `${pointer.hit.kind}:${String(pointer.hit.key)}` : 'none'
  return {
    calls,
    tool: {
      down: (pointer) => {
        const taken = take(pointer)
        calls.push(`down ${name(pointer)} ${taken}`)
        return taken
      },
      move: (pointer) => {
        calls.push(`move ${pointer.point.x - 400} ${pointer.point.y - 300}`)
      },
      up: (pointer, cancelled) => {
        calls.push(`up ${pointer.point.x - 400} ${pointer.point.y - 300} ${cancelled}`)
        return true
      },
      cursor: (pointer) => (pointer.hit?.kind === 'shape' ? cursor : null),
      key: (event) => {
        const used = keys.includes(event.key)
        calls.push(`key ${event.key} ${used}`)
        return used
      },
    },
  }
}

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function at(x: number, y: number) {
  return { x: x + 400, y: y + 300 }
}

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void {
  const point = at(x, y)
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: point.x,
      clientY: point.y,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  )
}

function touch(target: EventTarget, type: string, id: number, x: number, y: number): void {
  pointer(target, type, x, y, { pointerId: id, pointerType: 'touch', isPrimary: id === 1 })
}

function wheel(target: EventTarget, deltaY: number): void {
  const point = at(0, 0)
  const init = { clientX: point.x, clientY: point.y, deltaY, bubbles: true, cancelable: true }
  const event = new WheelEvent('wheel', init)
  for (const name of ['clientX', 'clientY'] as const) {
    Object.defineProperty(event, name, { value: init[name] })
  }
  for (const name of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
    Object.defineProperty(event, name, { value: false })
  }
  target.dispatchEvent(event)
}

function key(graph: GraphInstance, name: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  graph.element.dispatchEvent(event)
  dom.flushFrames()
  return event.defaultPrevented
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function record(graph: GraphInstance): string[] {
  const log: string[] = []
  const names = [
    'click',
    'doubleclick',
    'dragstart',
    'dragend',
    'selectionchange',
    'pointerenter',
    'pointerleave',
  ] as const
  for (const name of names) {
    graph.on(name, (event) => {
      const target = 'target' in event && event.target ? event.target : null
      log.push(target ? `${name} ${target.kind}:${String(target.key)}` : name)
    })
  }
  graph.on('viewchange', ({ view }) => {
    log.push(`view ${round(view.x)} ${round(view.y)} ${round(view.zoom)}`)
  })
  return log
}

function script(graph: GraphInstance): string[] {
  const log = record(graph)
  const canvas = canvasOf(graph)
  const note = (label: string) => {
    dom.flushFrames()
    const { nodes, edges, shapes } = graph.selection.get()
    log.push(
      `${label}: cursor=${canvas.style.cursor} selection=${[...nodes, ...edges, ...(shapes ?? [])].join(',')}`,
    )
  }
  pointer(canvas, 'pointermove', -100, 0)
  pointer(canvas, 'pointerdown', -100, 0)
  pointer(canvas, 'pointerup', -100, 0)
  note('click node')
  pointer(canvas, 'pointerdown', -100, 0)
  pointer(canvas, 'pointermove', -80, 10)
  pointer(canvas, 'pointermove', -60, 20)
  note('dragging node')
  pointer(canvas, 'pointerup', -60, 20)
  log.push(`a at ${JSON.stringify(graph.positions.get('a'))}`)
  note('dropped node')
  pointer(canvas, 'pointermove', -200, -150)
  pointer(canvas, 'pointerdown', -200, -150)
  pointer(canvas, 'pointerup', -200, -150)
  note('click shape')
  pointer(canvas, 'pointerdown', -200, -150)
  pointer(canvas, 'pointermove', -190, -150)
  pointer(canvas, 'pointermove', -180, -140)
  pointer(canvas, 'pointerup', -180, -140)
  note('pan from shape')
  pointer(canvas, 'pointerdown', 250, 250)
  pointer(canvas, 'pointermove', 240, 250)
  pointer(canvas, 'pointerup', 240, 250)
  note('pan from background')
  pointer(canvas, 'pointerdown', 300, -240, { shiftKey: true })
  for (const [x, y] of [
    [300, 240],
    [-340, 240],
    [-340, -240],
  ] as const) {
    pointer(canvas, 'pointermove', x, y, { shiftKey: true })
  }
  note('lasso')
  pointer(canvas, 'pointerup', -340, -240, { shiftKey: true })
  note('lassoed')
  canvas.dispatchEvent(
    new MouseEvent('dblclick', { clientX: 300, clientY: 300, bubbles: true, cancelable: true }),
  )
  note('double click background')
  wheel(canvas, -100)
  note('wheel')
  touch(canvas, 'pointerdown', 1, 0, 0)
  touch(canvas, 'pointermove', 1, 20, 0)
  touch(canvas, 'pointerdown', 2, 100, 0)
  touch(canvas, 'pointermove', 2, 200, 0)
  touch(canvas, 'pointerup', 2, 200, 0)
  touch(canvas, 'pointermove', 1, 10, 0)
  touch(canvas, 'pointerup', 1, 10, 0)
  note('pinch')
  graph.element.focus()
  log.push(`ArrowRight ${key(graph, 'ArrowRight')} focused=${graph.store.get().focused?.key}`)
  log.push(`Delete ${key(graph, 'Delete')}`)
  log.push(`Escape ${key(graph, 'Escape')}`)
  note('keys')
  return log
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('gestures with a tool', () => {
  it('changes nothing with a tool that takes nothing', () => {
    const plain = mount()
    const expected = script(plain)
    plain.destroy()
    dom.restore()
    dom = installDom()
    const graph = mount()
    const spy = spyTool(() => false, [], null)
    expect(internalsOf(graph, 'test').tool(spy.tool)).toBe(true)
    expect(script(graph)).toEqual(expected)
    expect(spy.calls.filter((call) => call.startsWith('down')).length).toBeGreaterThan(0)
    expect(spy.calls.some((call) => call.startsWith('move') || call.startsWith('up'))).toBe(false)
    graph.destroy()
  })

  it('gives a press to the tool after picking, with no core drag, pan, click or selection', () => {
    const graph = mount()
    const spy = spyTool((pointer) => pointer.hit?.kind === 'shape')
    internalsOf(graph, 'test').tool(spy.tool)
    const log = record(graph)
    const canvas = canvasOf(graph)
    pointer(canvas, 'pointermove', -200, -150)
    expect(canvas.style.cursor).toBe('move')
    pointer(canvas, 'pointerdown', -200, -150)
    pointer(canvas, 'pointermove', -180, -150)
    pointer(canvas, 'pointermove', -160, -140)
    pointer(canvas, 'pointerup', -160, -140)
    dom.flushFrames()
    expect(spy.calls).toEqual([
      'down shape:z true',
      'move -180 -150',
      'move -160 -140',
      'up -160 -140 false',
    ])
    expect(log).toEqual(['pointerenter shape:z'])
    expect(graph.selection.get().shapes).toEqual([])
    expect(graph.store.get().view).toEqual({ x: 0, y: 0, zoom: 1 })
    pointer(canvas, 'pointerdown', -200, -150)
    pointer(canvas, 'pointerup', -200, -150)
    expect(log.slice(1)).toEqual(['click shape:z'])
    expect(graph.selection.get().shapes).toEqual([])
    pointer(canvas, 'pointermove', 250, 250)
    expect(canvas.style.cursor).toBe('')
    pointer(canvas, 'pointerdown', -100, 0)
    pointer(canvas, 'pointermove', -80, 0)
    pointer(canvas, 'pointerup', -80, 0)
    expect(log).toContain('dragstart node:a')
    expect(spy.calls.at(-1)).toBe('down node:a false')
    graph.destroy()
  })

  it('cancels the gesture of the tool on a second finger, then pinches with both', () => {
    const graph = mount()
    const spy = spyTool(() => true)
    internalsOf(graph, 'test').tool(spy.tool)
    const canvas = canvasOf(graph)
    touch(canvas, 'pointerdown', 1, 0, 0)
    touch(canvas, 'pointermove', 1, 20, 0)
    touch(canvas, 'pointerdown', 2, 100, 0)
    expect(spy.calls).toEqual(['down none true', 'move 20 0', 'up 20 0 true'])
    touch(canvas, 'pointermove', 2, 200, 0)
    expect(graph.store.get().view.zoom).toBeCloseTo(2.25)
    touch(canvas, 'pointerup', 2, 200, 0)
    touch(canvas, 'pointermove', 1, 10, 0)
    touch(canvas, 'pointerup', 1, 10, 0)
    expect(spy.calls).toHaveLength(3)
    graph.destroy()
  })

  it('gives keys to the tool first and the unused ones to the graph', () => {
    const graph = mount()
    const spy = spyTool(() => false, ['Delete', 'ArrowLeft'])
    internalsOf(graph, 'test').tool(spy.tool)
    graph.element.focus()
    expect(key(graph, 'ArrowLeft')).toBe(true)
    expect(graph.store.get().focused).toBeNull()
    expect(key(graph, 'ArrowRight')).toBe(true)
    expect(graph.store.get().focused).not.toBeNull()
    expect(key(graph, 'Delete')).toBe(true)
    expect(spy.calls).toEqual(['key ArrowLeft true', 'key ArrowRight false', 'key Delete true'])
    graph.destroy()
  })

  it('takes one tool at a time, and lets it go', () => {
    const graph = mount()
    const internals = internalsOf(graph, 'test')
    const first = spyTool(() => true)
    expect(internals.tool(first.tool)).toBe(true)
    expect(internals.tool(spyTool(() => true).tool)).toBe(false)
    const canvas = canvasOf(graph)
    pointer(canvas, 'pointerdown', 250, 250)
    expect(internals.tool(null)).toBe(true)
    pointer(canvas, 'pointermove', 200, 250)
    pointer(canvas, 'pointerup', 200, 250)
    expect(first.calls).toEqual(['down none true'])
    expect(graph.store.get().view).toEqual({ x: 0, y: 0, zoom: 1 })
    pointer(canvas, 'pointerdown', 250, 250)
    pointer(canvas, 'pointermove', 200, 250)
    pointer(canvas, 'pointerup', 200, 250)
    expect(graph.store.get().view.x).toBe(50)
    graph.destroy()
    expect(internals.tool(first.tool)).toBe(false)
  })

  it('claims the map for a gesture of the tool', () => {
    const fake: FakeMap = fakeMap()
    const graph = mountMapGraph(fake.map, {
      definition: defineGraph({
        marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
      }) as GraphDefinition,
      ariaLabel: 'map',
    })
    fake.render()
    dom.flushFrames()
    const spy = spyTool(() => true)
    internalsOf(graph, 'test').tool(spy.tool)
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1, button: 0 }),
    )
    expect(fake.fake.dragPan.enabled).toBe(false)
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 5, clientY: 5, pointerId: 1, button: 0 }),
    )
    expect(fake.fake.dragPan.enabled).toBe(true)
    expect(spy.calls).toEqual(['down none true', 'up -395 -295 false'])
    graph.destroy()
  })
})

describe('gestures without a tool', () => {
  it('records the same gestures as before the pointer tools', () => {
    const graph = mount()
    expect(script(graph)).toMatchInlineSnapshot(`
      [
        "pointerenter node:a",
        "click node:a",
        "selectionchange",
        "click node: cursor=pointer selection=a",
        "dragstart node:a",
        "dragging node: cursor=grabbing selection=a",
        "dragend node:a",
        "a at {"x":-60,"y":20}",
        "dropped node: cursor=pointer selection=a",
        "pointerleave node:a",
        "pointerenter shape:z",
        "click shape:z",
        "selectionchange",
        "click shape: cursor=pointer selection=z",
        "view -10 0 1",
        "view -20 -10 1",
        "pan from shape: cursor=pointer selection=z",
        "view -10 -10 1",
        "pointerleave shape:z",
        "pan from background: cursor= selection=z",
        "lasso: cursor=crosshair selection=z",
        "selectionchange",
        "lassoed: cursor= selection=a,b,c,z",
        "doubleclick",
        "double click background: cursor= selection=a,b,c,z",
        "view -10 -10 1.28",
        "wheel: cursor= selection=a,b,c,z",
        "view -25.58 -10 1.28",
        "view -16.92 -10 2.89",
        "view -13.46 -10 2.89",
        "pinch: cursor= selection=a,b,c,z",
        "view 0 100 2.89",
        "ArrowRight true focused=c",
        "Delete false",
        "selectionchange",
        "Escape true",
        "keys: cursor= selection=",
      ]
    `)
    graph.destroy()
  })

  it('claims the map for a node drag and a lasso only', () => {
    const fake: FakeMap = fakeMap()
    const graph = mountMapGraph(fake.map, {
      definition: defineGraph({
        marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
        interaction: { lasso: true },
      }) as GraphDefinition,
      ariaLabel: 'map',
    })
    fake.render()
    dom.flushFrames()
    const a = graph.view.toScreen(graph.positions.get('a') ?? { x: 0, y: 0 })
    const claims: boolean[] = []
    const watch = () => claims.push(fake.fake.dragPan.enabled)
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: a.x, clientY: a.y, pointerId: 1, button: 0 }),
    )
    watch()
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: a.x, clientY: a.y, pointerId: 1, button: 0 }),
    )
    watch()
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 5, clientY: 5, pointerId: 1, button: 0 }),
    )
    watch()
    fake.canvas.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 5, clientY: 5, pointerId: 1, button: 0 }),
    )
    watch()
    expect(claims).toEqual([false, true, true, true])
    graph.destroy()
  })
})
