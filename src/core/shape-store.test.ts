import { describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { labelAnchor, labelOrder } from '../shapes/labels'
import { defaults } from '../theme/tokens'
import type { GraphDefinition, LiveSource, Mark, ShapeGeometry, SourceChange } from '../types'
import { noColor } from './columns'
import { createGraphModel } from './graph-model'
import type { AnyIssue } from './issues'
import { Palette } from './palette'
import { createScene } from './scene'
import { ShapeStore } from './shape-store'
import { shapeOpacity, shapeShown, sightOf } from './visibility'

type Zone = {
  id: string
  geometry: ShapeGeometry | null
  color?: string
  rank?: number
  width?: number
}

const box = (x: number, size = 10): ShapeGeometry => ({ x, y: 0, width: size, height: size })
const triangle = (x: number): ShapeGeometry => ({
  rings: [
    [
      [x, 0],
      [x + 10, 0],
      [x, 10],
    ],
  ],
})

function setup() {
  const model = createGraphModel()
  const scene = createScene()
  const render = (marks: readonly Mark[]) => {
    const definition: GraphDefinition = defineGraph({ marks })
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(model, model.flush())
  }
  const store = scene.shapes
  const indexOf = (key: string) => model.shape(key)?.index ?? -1
  const color = (id: number | undefined) =>
    id === undefined || id === noColor ? null : scene.palette.colors[id]
  const issues = () => {
    const found: AnyIssue[] = []
    store.collectIssues(found)
    return found
  }
  const drawn = () => Array.from(store.drawOrder(), (index) => store.keys[index])
  return { model, scene, store, render, indexOf, color, issues, drawn }
}

function createLiveSource<T>(initial: SourceChange<T>[] = []) {
  let listener: ((changes: ReadonlyArray<SourceChange<T>>) => void) | null = null
  const source: LiveSource<T> = {
    subscribeChanges(callback, options) {
      listener = callback
      if (options?.includeInitialState) callback(initial)
      return {
        unsubscribe() {
          listener = null
        },
      }
    },
  }
  return {
    source,
    emit(changes: SourceChange<T>[]) {
      listener?.(changes)
    },
  }
}

describe('ShapeStore', () => {
  it('reads shapes with the theme colors by default, and lines without fill', () => {
    const { store, render, indexOf, color, model } = setup()
    render([
      shapes([
        { id: 'a', geometry: box(0) },
        {
          id: 'b',
          geometry: {
            points: [
              [0, 0],
              [10, 10],
            ],
          },
        },
      ]),
    ])
    expect(store.count).toBe(2)
    expect(model.shapeCount).toBe(2)
    expect(color(store.fill[indexOf('a')])).toBe(defaults.shapeFill)
    expect(color(store.stroke[indexOf('a')])).toBe(defaults.shapeStroke)
    expect(store.fill[indexOf('b')]).toBe(noColor)
    expect(color(store.stroke[indexOf('b')])).toBe(defaults.shapeStroke)
    expect(store.strokeWidth[indexOf('a')]).toBe(1)
    expect(store.opacity[indexOf('a')]).toBe(1)
  })

  it('writes the styles of the options and bounds the numbers', () => {
    const { store, render, indexOf, color } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: box(0), color: '#ff0000', width: -3 },
      { id: 'b', geometry: box(20), width: 4 },
    ]
    render([
      shapes(zones, {
        fill: (zone) => zone.color ?? null,
        stroke: null,
        strokeWidth: (zone) => zone.width ?? 1,
        dash: 'dashed',
        opacity: 2,
      }),
    ])
    expect(color(store.fill[indexOf('a')])).toBe('#ff0000')
    expect(store.fill[indexOf('b')]).toBe(noColor)
    expect(store.stroke[indexOf('a')]).toBe(noColor)
    expect(store.strokeWidth[indexOf('a')]).toBe(0)
    expect(store.strokeWidth[indexOf('b')]).toBe(4)
    expect(store.dash[indexOf('a')]).toBe(1)
    expect(store.opacity[indexOf('a')]).toBe(1)
  })

  it('draws marks in order, then by order value, then by arrival', () => {
    const { render, drawn } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: box(0), rank: 2 },
      { id: 'b', geometry: box(20) },
      { id: 'c', geometry: box(40), rank: 1 },
      { id: 'd', geometry: box(60) },
    ]
    render([shapes([{ id: 'top', geometry: box(80) }]), shapes(zones, { order: 'rank' })])
    expect(drawn()).toEqual(['top', 'b', 'd', 'c', 'a'])
  })

  it('reads a geometry again only when its value changes', () => {
    const { store, render, indexOf } = setup()
    const geometry = triangle(0)
    render([shapes([{ id: 'a', geometry, color: '#000000' }], { fill: (zone) => zone.color })])
    const read = store.geometry[indexOf('a')]
    const version = store.version
    render([shapes([{ id: 'a', geometry, color: '#ffffff' }], { fill: (zone) => zone.color })])
    expect(store.geometry[indexOf('a')]).toBe(read)
    expect(store.version).toBe(version)
    render([shapes([{ id: 'a', geometry: triangle(5) }])])
    expect(store.geometry[indexOf('a')]).not.toBe(read)
    expect(store.version).toBeGreaterThan(version)
  })

  it('reports unreadable geometries until they are fixed or removed', () => {
    const { store, render, issues, drawn } = setup()
    render([
      shapes([
        { id: 'a', geometry: { rings: [] } },
        { id: 'b', geometry: null },
        { id: 'c', geometry: box(0) },
      ]),
    ])
    expect(issues()).toEqual([{ type: 'invalid-shape', kind: 'shapes', key: 'a', reason: 'empty' }])
    expect(drawn()).toEqual(['c'])
    const version = store.issueVersion
    render([shapes([{ id: 'a', geometry: box(0) }])])
    expect(issues()).toEqual([])
    expect(store.issueVersion).toBeGreaterThan(version)
    expect(drawn()).toEqual(['a'])
  })

  it('reports shapes without key and with the same key', () => {
    const { model, render } = setup()
    render([
      shapes([
        { id: 'a', geometry: box(0) },
        { id: 'a', geometry: box(20) },
      ]),
      shapes([{ name: Number.NaN, geometry: box(0) }], { key: 'name' }),
      shapes([{ id: 'a', geometry: box(0) }]),
    ])
    const found: AnyIssue[] = []
    model.collectIssues(found)
    expect(found).toContainEqual({ type: 'duplicate-key', kind: 'shapes', key: 'a' })
    expect(found).toContainEqual({
      type: 'missing-key',
      kind: 'shapes',
      datum: { name: Number.NaN, geometry: box(0) },
    })
    expect(model.shapeCount).toBe(1)
  })

  it('follows a live source', () => {
    const { store, render, drawn, model } = setup()
    const live = createLiveSource<Zone>([
      { type: 'insert', key: 'a', value: { id: 'a', geometry: box(0) } },
    ])
    render([shapes(live.source)])
    expect(drawn()).toEqual(['a'])
    live.emit([
      { type: 'insert', key: 'b', value: { id: 'b', geometry: box(20) } },
      { type: 'delete', key: 'a', value: { id: 'a', geometry: box(0) } },
    ])
    store.apply(model, model.flush().shapes)
    expect(drawn()).toEqual(['b'])
    expect(store.count).toBe(1)
    live.emit([{ type: 'update', key: 'b', value: { id: 'b', geometry: box(20, 30) } }])
    store.apply(model, model.flush().shapes)
    expect(store.geometry[model.shape('b')?.index ?? -1]?.maxX).toBe(50)
  })

  it('frees the colors of removed shapes and keeps nodes apart', () => {
    const { scene, store, render, indexOf } = setup()
    render([nodes([{ id: 'a' }]), shapes([{ id: 'a', geometry: box(0) }], { fill: '#123456' })])
    expect(scene.nodes.alive[0]).toBe(1)
    expect(indexOf('a')).toBe(0)
    render([nodes([{ id: 'a' }])])
    expect(store.count).toBe(0)
    expect(store.drawOrder().length).toBe(0)
    expect(store.marked).toBe(false)
  })

  it('keeps the engine of its shape marks, and warns once for a mark without one', () => {
    const { store, render } = setup()
    expect(store.engine).toBeNull()
    render([shapes([{ id: 'a', geometry: box(0) }])])
    expect(typeof store.engine?.layer).toBe('function')
    expect(typeof store.engine?.svg).toBe('function')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const foreign = new ShapeStore(new Palette())
    const stray = { type: 'shapes', name: undefined, layer: undefined, data: [], options: {} }
    foreign.setMarks([stray as Mark, stray as Mark])
    foreign.setMarks([stray as Mark])
    expect(foreign.engine).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('ShapeStore labels and pins', () => {
  type Pinned = { id: string; geometry: ShapeGeometry; node?: string; name?: string }

  it('keeps no label or pin columns for shapes without them', () => {
    const { store, render } = setup()
    render([shapes([{ id: 'a', geometry: box(0) }])])
    expect(store.labels).toBeNull()
    expect(store.pinNode).toBeNull()
    expect(store.pinCount).toBe(0)
  })

  it('reads labels, frees their colors, and orders them by size', () => {
    const { store, scene, render, indexOf, color } = setup()
    const zones: Pinned[] = [
      { id: 'small', geometry: box(0, 10), name: 'Small' },
      { id: 'large', geometry: box(20, 40), name: 'Large' },
      { id: 'none', geometry: box(80, 60) },
    ]
    render([
      shapes(zones, {
        label: { text: 'name', color: '#ff0000', size: 20, weight: 'bold', background: true },
      }),
    ])
    const labels = store.labels
    expect(labels?.count).toBe(2)
    expect(labels?.text[indexOf('large')]).toBe('Large')
    expect(labels?.text[indexOf('none')]).toBeFalsy()
    expect(color(labels?.labelColor[indexOf('small')])).toBe('#ff0000')
    expect(labels?.labelSize[indexOf('small')]).toBe(20)
    expect(labels?.labelWeight[indexOf('small')]).toBe(700)
    expect(color(labels?.labelBackground[indexOf('small')])).toBe(defaults.labelBackground)
    expect(Array.from(labelOrder(store).order, (index) => store.keys[index])).toEqual([
      'large',
      'small',
    ])
    expect(labelAnchor(store, indexOf('large'))).toBe(true)
    expect(labels?.anchor[indexOf('large') * 2]).toBe(40)
    const used = scene.palette.colors.indexOf('#ff0000')
    render([shapes(zones.slice(2), { label: { text: 'name', color: '#ff0000' } })])
    expect(store.labels?.count).toBe(0)
    expect(labelOrder(store).order.length).toBe(0)
    render([shapes([{ id: 'other', geometry: box(0) }], { fill: '#00ff00' })])
    expect(scene.palette.colors.indexOf('#00ff00')).toBe(used)
  })

  it('pins shapes to nodes, and leaves them waiting while the node is missing', () => {
    const { store, model, render, indexOf, drawn } = setup()
    const zones: Pinned[] = [
      { id: 'here', geometry: box(0), node: 'a' },
      { id: 'later', geometry: box(20), node: 'b' },
      { id: 'free', geometry: box(40) },
    ]
    const mark = shapes(zones, { node: 'node' })
    render([nodes([{ id: 'a' }]), mark])
    expect(store.pinNode?.[indexOf('here')]).toBe(model.node('a')?.index)
    expect(store.pinned(indexOf('here'))).toBe(true)
    expect(store.pinned(indexOf('free'))).toBe(false)
    expect(store.pinCount).toBe(2)
    expect(store.pendingCount).toBe(1)
    expect(drawn()).toEqual(['here', 'free'])
    render([nodes([{ id: 'a' }, { id: 'b' }]), mark])
    expect(store.pendingCount).toBe(0)
    expect(store.pinNode?.[indexOf('later')]).toBe(model.node('b')?.index)
    expect(drawn()).toEqual(['here', 'later', 'free'])
    render([nodes([{ id: 'b' }]), mark])
    expect(store.pendingCount).toBe(1)
    expect(drawn()).toEqual(['later', 'free'])
    render([nodes([{ id: 'b' }]), shapes(zones.slice(1), { node: 'node' })])
    expect(store.pinCount).toBe(1)
    expect(store.pendingCount).toBe(0)
  })

  it('hides a pinned shape while its node is hidden', () => {
    const { store, scene, render, indexOf } = setup()
    const zones: Pinned[] = [{ id: 'z', geometry: box(0), node: 'a' }]
    render([nodes([{ id: 'a' }], { minZoom: 4 }), shapes(zones, { node: 'node' })])
    const index = indexOf('z')
    expect(shapeShown(store, index, sightOf(8))).toBe(true)
    expect(shapeShown(store, index, sightOf(2))).toBe(false)
    expect(shapeOpacity(store, index, sightOf(2))).toBe(0)
    expect(scene.nodes.alive[store.pinNode?.[index] ?? -1]).toBe(1)
  })
})
