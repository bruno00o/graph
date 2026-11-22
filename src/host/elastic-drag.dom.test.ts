import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type {
  InteractionOptions,
  Key,
  Layout,
  LayoutFollower,
  LayoutGraph,
  LayoutListener,
  Point,
} from '../types'
import type { GraphPositionEvent } from './events'
import { createGraphHost, type GraphInstance } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface Follow {
  readonly graph: LayoutGraph
  readonly held: readonly number[]
  readonly pixel: number
  readonly holds: (readonly [number, number, number])[]
  readonly steps: number[]
  released: boolean
  stopped: boolean
}

let reduce = false
let dom: FakeDom

function fakeLayout(after = 3, fail?: 'follow' | 'step') {
  const runs: { graph: LayoutGraph; listener: LayoutListener }[] = []
  const follows: Follow[] = []
  const layout: Layout = {
    name: 'fake',
    options: {},
    start(graph, listener) {
      runs.push({ graph, listener })
      return { pin: () => {}, stop: () => {} }
    },
    follow(graph, held, pixel) {
      if (fail === 'follow') throw new Error('no follow')
      const record: Follow = {
        graph,
        held,
        pixel,
        holds: [],
        steps: [],
        released: false,
        stopped: false,
      }
      follows.push(record)
      const moved: number[] = []
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.alive[index] === 1 && graph.movable[index] === 1) moved.push(index)
      }
      let left = after
      const follower: LayoutFollower = {
        hold: (index, x, y) => record.holds.push([index, x, y]),
        release: () => {
          record.released = true
        },
        step(time) {
          if (fail === 'step') throw new Error('no step')
          record.steps.push(time)
          if (record.stopped) return false
          for (const index of moved) graph.xy[index * 2] = (graph.xy[index * 2] ?? 0) + 1
          if (!record.released) return Number.isFinite(time)
          left = Number.isFinite(time) ? left - 1 : 0
          return left > 0
        },
        moved,
        stop: () => {
          record.stopped = true
        },
      }
      return follower
    },
  }
  return { layout, runs, follows }
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function definition(
  layout: Layout | null,
  list: readonly Item[] = items,
  drag: InteractionOptions['drag'] = 'elastic',
) {
  return defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to' }),
      nodes(list, { x: 'x', y: 'y', size: 10 }),
    ],
    layout,
    interaction: { drag },
    transitions: { layout: 0 },
  })
}

function mount(
  setup: ReturnType<typeof fakeLayout>,
  list: readonly Item[] = items,
  drag: InteractionOptions['drag'] = 'elastic',
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(setup.layout, list, drag), ariaLabel: 'graph' },
    fakeRenderer,
  )
  dom.flushFrames()
  const run = setup.runs[0]
  if (run) {
    const xy = new Float32Array(run.graph.capacity * 2)
    for (let index = 0; index < run.graph.capacity; index++) {
      const moving = run.graph.movable[index] === 1
      xy[index * 2] = moving ? index * 100 : (run.graph.xy[index * 2] ?? 0)
      xy[index * 2 + 1] = moving ? 0 : (run.graph.xy[index * 2 + 1] ?? 0)
    }
    run.listener.end(xy)
  }
  graph.view.set({ x: 100, y: 0, zoom: 2 })
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  return graph.element.querySelector('canvas') as HTMLCanvasElement
}

function screenOf(graph: GraphInstance, key: Key): Point {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${String(key)}`)
  return graph.view.toScreen(position)
}

function press(target: EventTarget, at: Point): void {
  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      clientX: at.x,
      clientY: at.y,
      button: 0,
      pointerId: 1,
      bubbles: true,
    }),
  )
}

function move(target: EventTarget, at: Point, type = 'pointermove'): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: at.x,
      clientY: at.y,
      button: 0,
      pointerId: 1,
      bubbles: true,
    }),
  )
}

function frames(count: number, from = 1000): void {
  for (let frame = 0; frame < count; frame++) dom.runFrames(from + frame * 16)
}

beforeEach(() => {
  dom = installDom()
  reduce = false
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduce
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  dom.restore()
})

describe('elastic drag', () => {
  it('leaves the other nodes alone by default', () => {
    const setup = fakeLayout()
    const graph = mount(setup, items, true)
    const before = graph.positions.get('b')
    const start = screenOf(graph, 'a')
    press(canvasOf(graph), start)
    move(canvasOf(graph), { x: start.x - 40, y: start.y })
    move(canvasOf(graph), { x: start.x - 40, y: start.y }, 'pointerup')
    dom.flushFrames()
    expect(setup.follows).toHaveLength(0)
    expect(graph.positions.get('b')).toEqual(before)
    graph.destroy()
  })

  it('moves the neighbors while the node is held, then announces them once calm', () => {
    const setup = fakeLayout()
    const graph = mount(setup)
    const events: GraphPositionEvent[] = []
    graph.on('positionchange', (event) => events.push(event))
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    const bx = graph.positions.get('b')?.x ?? 0
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    const follow = setup.follows[0]
    expect(setup.follows).toHaveLength(1)
    expect(follow?.pixel).toBe(0.5)
    expect(follow?.held).toHaveLength(1)
    const a = follow?.held[0] ?? -1
    expect(follow?.graph.movable[a]).toBe(0)
    expect(follow?.holds.at(-1)).toEqual([a, -20, 0])
    frames(4)
    expect(graph.positions.get('b')?.x).toBe(bx + 4)
    expect(events.map((event) => [...event.positions.keys()])).toEqual([['a']])
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    expect(follow?.released).toBe(true)
    frames(10, 2000)
    expect(follow?.stopped).toBe(true)
    expect(graph.positions.get('b')?.x).toBe(bx + 7)
    expect(events.at(-1)?.origin).toBe('drag')
    expect([...(events.at(-1)?.positions.keys() ?? [])].sort()).toEqual(['b', 'c'])
    expect(events.at(-1)?.positions.get('b')).toEqual({ x: bx + 7, y: 0 })
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
  })

  it('advances by the time between frames, at most 100 ms', () => {
    const setup = fakeLayout()
    const graph = mount(setup)
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    dom.runFrames(1000)
    dom.runFrames(1032)
    dom.runFrames(1532)
    expect(setup.follows[0]?.steps).toEqual([1000 / 60, 32, 100])
    graph.destroy()
  })

  it('never offers the nodes placed by their data', () => {
    const setup = fakeLayout()
    const graph = mount(setup, [{ id: 'a' }, { id: 'b', x: 100, y: 0 }, { id: 'c' }])
    const start = screenOf(graph, 'a')
    press(canvasOf(graph), start)
    move(canvasOf(graph), { x: start.x - 40, y: start.y })
    const follow = setup.follows[0]
    const keys = follow?.graph.keys ?? []
    const movable = keys.filter((_, index) => follow?.graph.movable[index] === 1)
    expect(movable).toEqual(['c'])
    graph.destroy()
  })

  it('makes settled wait until the neighbors are calm', async () => {
    const setup = fakeLayout()
    const graph = mount(setup)
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    let done = false
    const settled = graph.settled().then(() => {
      done = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(done).toBe(false)
    for (let round = 0; round < 20 && !done; round++) {
      dom.flushFrames()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await settled
    expect(setup.follows[0]?.stopped).toBe(true)
    graph.destroy()
  })

  it('stops when a layout starts, and keeps the positions reached', () => {
    const setup = fakeLayout()
    const graph = mount(setup)
    const events: GraphPositionEvent[] = []
    graph.on('positionchange', (event) => events.push(event))
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    frames(1)
    const reached = graph.positions.get('b')
    void graph.layout.run()
    frames(1, 2000)
    expect(setup.follows[0]?.stopped).toBe(true)
    expect(graph.positions.get('b')).toEqual(reached)
    expect([...(events.at(-1)?.positions.keys() ?? [])].sort()).toEqual(['b', 'c'])
    graph.destroy()
  })

  it('starts again on a structural change while the node is held', () => {
    const setup = fakeLayout()
    const graph = mount(setup)
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    frames(1)
    graph.update({ definition: definition(setup.layout, [...items, { id: 'd', x: 500, y: 0 }]) })
    frames(1, 2000)
    expect(setup.follows).toHaveLength(2)
    expect(setup.follows[0]?.stopped).toBe(true)
    expect(setup.follows[1]?.stopped).toBe(false)
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    graph.update({ definition: definition(setup.layout, items) })
    frames(1, 3000)
    expect(setup.follows).toHaveLength(2)
    expect(setup.follows[1]?.stopped).toBe(true)
    graph.destroy()
  })

  it('makes the neighbors jump once, after the drop, with reduced motion', () => {
    reduce = true
    const setup = fakeLayout()
    const graph = mount(setup)
    const canvas = canvasOf(graph)
    const start = screenOf(graph, 'a')
    const bx = graph.positions.get('b')?.x ?? 0
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    frames(4)
    const follow = setup.follows[0]
    expect(follow?.steps).toEqual([])
    expect(graph.positions.get('b')?.x).toBe(bx)
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    frames(3, 2000)
    expect(follow?.steps.every((time) => time === Number.POSITIVE_INFINITY)).toBe(true)
    expect(follow?.released).toBe(true)
    expect(follow?.stopped).toBe(true)
    expect(graph.positions.get('b')?.x).toBe(bx + 2)
    graph.destroy()
  })

  it('reports a follower that throws and leaves the nodes in place', () => {
    const errors: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => errors.push(error))
    for (const fail of ['follow', 'step'] as const) {
      const setup = fakeLayout(3, fail)
      const graph = mount(setup)
      const before = graph.positions.get('b')
      const start = screenOf(graph, 'a')
      press(canvasOf(graph), start)
      move(canvasOf(graph), { x: start.x - 40, y: start.y })
      frames(2)
      move(canvasOf(graph), { x: start.x - 40, y: start.y }, 'pointerup')
      dom.flushFrames()
      expect(graph.positions.get('b')).toEqual(before)
      expect(screenOf(graph, 'a').x).toBeCloseTo(start.x - 40, 3)
      graph.destroy()
    }
    expect(errors).toHaveLength(2)
  })

  it('does nothing on a map', () => {
    const setup = fakeLayout()
    const { map, canvas, render } = fakeMap()
    const graph = mountMapGraph(map, {
      definition: definition(setup.layout, [{ id: 'a', x: 0, y: 0 }, { id: 'b' }, { id: 'c' }]),
      ariaLabel: 'map',
    })
    render()
    const start = screenOf(graph, 'b')
    expect(graph.pick(start)?.key).toBe('b')
    const moved: Key[] = []
    graph.on('drag', ({ target }) => moved.push(target.key))
    press(canvas, start)
    move(canvas, { x: start.x - 40, y: start.y })
    move(canvas, { x: start.x - 40, y: start.y }, 'pointerup')
    render()
    expect(moved).toContain('b')
    expect(setup.follows).toHaveLength(0)
    graph.destroy()
  })

  it('refuses another drag mode', () => {
    expect(() => definition(null, items, 'loose' as unknown as InteractionOptions['drag'])).toThrow(
      TypeError,
    )
  })
})
