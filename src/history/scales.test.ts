import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import type { HistoryCut } from '../core/history'
import { createScene } from '../core/scene'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { resolvedOf } from '../resolved-definition'
import { shapes } from '../shapes'
import type { GraphDefinitionOptions, HistoryEntry, HistoryValues, Mark } from '../types'
import { historyFrom } from '.'

type Item = { id: string; kind: string; weight: number }
type Link = { id: string; from: string; to: string; level: number }

const at = (time: number): HistoryCut => ({ time, inclusive: true })

function setup(options: GraphDefinitionOptions) {
  const model = createGraphModel()
  const scene = createScene()
  const render = (next: GraphDefinitionOptions = options) => {
    const definition = defineGraph(next)
    model.setMarks(definition.marks)
    scene.setDefinition(resolvedOf(definition))
    scene.apply(model, model.flush())
    return scene.takeDirty()
  }
  render()
  const step = (time: number) => {
    model.readAt(at(time))
    scene.apply(model, model.flush())
    return scene.takeDirty()
  }
  const index = (key: string) => model.node(key)?.index ?? -1
  const fill = (key: string) => scene.palette.colors[scene.nodes.fill[index(key)] ?? -1]
  const size = (key: string) => scene.nodes.size[index(key)]
  return { model, scene, render, step, fill, size }
}

const items: Item[] = [
  { id: 'a', kind: 'k1', weight: 1 },
  { id: 'b', kind: 'k1', weight: 2 },
  { id: 'c', kind: 'k2', weight: 3 },
]
const entries: HistoryEntry<HistoryValues<Item>>[] = [
  { key: 'a', time: 10, values: { kind: 'k3', weight: 10 } },
  { key: 'b', time: 20, values: { kind: 'k4' } },
  { key: 'a', time: 30, values: { weight: -5 } },
]

function marks(history = historyFrom(entries)): Mark[] {
  return [nodes(items, { color: 'kind', size: 'weight', history })]
}

describe('scales over the whole history', () => {
  it('covers every value the elements take, at every moment', () => {
    const { scene, step } = setup({ marks: marks() })
    expect(scene.scales().size.extent).toEqual([-5, 10])
    step(0)
    expect(scene.scales().size.extent).toEqual([-5, 10])
    expect([...scene.scales().color.scale.categories()]).toEqual(['k1', 'k2', 'k3', 'k4'])
  })

  it('gives categories the same colors whatever the moment read first', () => {
    const late = setup({ marks: marks() })
    const early = createGraphModel()
    const scene = createScene()
    early.readAt(at(0))
    const definition = defineGraph({ marks: marks() })
    early.setMarks(definition.marks)
    scene.setDefinition(resolvedOf(definition))
    scene.apply(early, early.flush())
    expect([...scene.scales().color.scale.categories()]).toEqual([
      ...late.scene.scales().color.scale.categories(),
    ])
  })

  it('rewrites only the elements a step crosses', () => {
    const { step, size } = setup({ marks: marks() })
    const big = size('c')
    const dirty = step(15)
    expect(dirty.nodes.size).toBe(2)
    expect(size('c')).toBe(big)
  })

  it('counts the values of the history as held, without drawn elements', () => {
    const { scene, step } = setup({ marks: marks() })
    step(0)
    const past = scene.scales().color.past
    expect(past?.get('k3')).toBe(1)
    expect(past?.get('k1')).toBe(2)
  })

  it('extends the categories with live entries without moving the others', () => {
    let emit: (changes: { type: 'insert'; key: string; value: unknown }[]) => void = () => {}
    const source = {
      subscribeChanges(callback: typeof emit, options?: { includeInitialState?: boolean }) {
        emit = callback
        if (options?.includeInitialState) {
          callback(entries.map((entry, n) => ({ type: 'insert', key: `e${n}`, value: entry })))
        }
        return { unsubscribe() {} }
      },
    }
    const { scene, model } = setup({ marks: marks(historyFrom(source as never)) })
    const before = [...scene.scales().color.scale.categories()]
    emit([{ type: 'insert', key: 'x', value: { key: 'c', time: 5, values: { kind: 'k0' } } }])
    scene.apply(model, model.flush())
    expect([...scene.scales().color.scale.categories()]).toEqual([...before, 'k0'])
    emit([{ type: 'insert', key: 'y', value: { key: 'c', time: 6, values: { weight: 99 } } }])
    scene.apply(model, model.flush())
    expect(scene.scales().size.extent).toEqual([-5, 99])
  })

  it('leaves marks without history on their current values', () => {
    const links: Link[] = [{ id: 'ab', from: 'a', to: 'b', level: 4 }]
    const { scene, step } = setup({
      marks: [...marks(), edges(links, { source: 'from', target: 'to', width: 'level' })],
    })
    step(0)
    expect(scene.scales().width.extent).toEqual([4, 4])
  })

  it('refolds when a mark reads another field', () => {
    const { scene, render } = setup({ marks: marks() })
    const history = historyFrom(entries)
    render({ marks: [nodes(items, { color: 'kind', size: () => 1, history })] })
    expect(scene.scales().size.extent).toEqual([1, 1])
  })

  it('goes back to the current values when the history goes away', () => {
    const { scene, step, render } = setup({ marks: marks() })
    step(0)
    render({ marks: [nodes(items, { color: 'kind', size: 'weight' })] })
    expect(scene.scales().size.extent).toEqual([1, 3])
    expect(scene.scales().color.past?.size ?? 0).toBe(0)
  })

  it('reads a new history even when all its entries come after the moment', () => {
    const { scene, step, render } = setup({ marks: marks() })
    step(0)
    const later = historyFrom([{ key: 'c', time: 50, values: { weight: 77 } }])
    render({ marks: marks(later) })
    expect(scene.scales().size.extent).toEqual([1, 77])
  })

  it('covers the widths and colors of edges and their ends', () => {
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', level: 2 },
      { id: 'bc', from: 'b', to: 'c', level: 3 },
    ]
    const history = historyFrom([
      { key: 'ab', time: 10, values: { level: 9 } },
      { key: 'bc', time: 20, values: { level: -1 } },
    ])
    const { scene, step } = setup({
      marks: [
        nodes(items),
        edges(links, {
          source: 'from',
          target: 'to',
          width: 'level',
          color: 'level',
          ends: { target: { color: (link) => (link.level > 5 ? 'high' : 'low') } },
          history,
        }),
      ],
    })
    step(0)
    expect(scene.scales().width.extent).toEqual([-1, 9])
    expect([...scene.scales().color.scale.categories()]).toEqual([2, 'low', 3, 9, 'high', -1])
  })

  it('covers the colors of shapes', () => {
    type Zone = {
      id: string
      geometry: { x: number; y: number; width: number; height: number }
      tone: string
    }
    const zones: Zone[] = [{ id: 'z', geometry: { x: 0, y: 0, width: 1, height: 1 }, tone: 't0' }]
    const history = historyFrom([{ key: 'z', time: 10, values: { tone: 't1' } }])
    const { scene, step } = setup({ marks: [shapes(zones, { color: 'tone', history })] })
    step(0)
    expect([...scene.scales().color.scale.categories()]).toEqual(['t0', 't1'])
    expect(scene.scales().shapeColor.length).toBeGreaterThan(0)
  })
})
