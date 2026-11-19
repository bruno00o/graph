import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { layers } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key, Layout, LayoutGraph } from '../types'
import { internalsOf } from './internals'
import { createGraphHost, type GraphInstance } from './mount-graph'

const advance = vi.hoisted(() => (char: string) => (char === 'W' ? 0.95 : 0.25))

vi.mock('../dom/text-width', () => ({
  createTextWidths: () => ({
    width: (text: string) => {
      let width = 0
      for (const char of text) width += advance(char)
      return width
    },
    setFont: () => false,
    reload: () => false,
  }),
}))

interface Item {
  readonly id: string
  readonly parent?: string
  readonly label?: string
  readonly side?: 'left' | 'right'
  readonly plated?: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

const labelSize = 16
const labelGap = 3
const platePad = 0.45
const wide = 'WWWWWWWW'
const narrow = 'iiiiiiiiiiiiiiii'
const items: Item[] = [
  { id: 'r' },
  { id: 'g', label: wide, side: 'right' },
  { id: 'h', label: wide, side: 'left' },
  { id: 'k', label: narrow, side: 'right', plated: true },
  { id: 'a1', parent: 'g' },
  { id: 'a2', parent: 'g' },
  { id: 'b1', parent: 'h' },
  { id: 'b2', parent: 'h' },
  { id: 'c1', parent: 'k' },
  { id: 'c2', parent: 'k' },
]
const links: Link[] = [
  { id: 'r-a1', from: 'r', to: 'a1' },
  { id: 'r-b1', from: 'r', to: 'b1' },
  { id: 'r-c1', from: 'r', to: 'c1' },
  { id: 'a', from: 'a1', to: 'a2' },
  { id: 'b', from: 'b1', to: 'b2' },
  { id: 'c', from: 'c1', to: 'c2' },
]

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

function mount(layout: Layout): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, {
            parent: 'parent',
            size: 20,
            container: { padding: 10 },
            label: {
              text: (item) => item.label ?? null,
              placement: (item) => item.side ?? 'top',
              size: labelSize,
              background: (item) => item.plated ?? false,
            },
          }),
        ],
        transitions: { layout: 0 },
        layout,
      }),
      ariaLabel: 'graph',
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function measured(text: string): number {
  let width = 0
  for (const char of text) width += advance(char)
  return width * labelSize
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}

describe('label space of groups', () => {
  it('reserves the measured width of a side label', async () => {
    const seen: LayoutGraph[] = []
    const capture: Layout = {
      name: 'capture',
      options: {},
      start: (graph, listener) => {
        seen.push(graph)
        queueMicrotask(() => listener.end(graph.xy))
        return { pin: () => {}, stop: () => {} }
      },
    }
    const graph = mount(capture)
    await Promise.resolve()
    const run = seen.at(-1)
    const side = (key: Key, at: number) =>
      run?.groups?.labelSpace?.[(run?.keys.indexOf(key) ?? 0) * 4 + at] ?? Number.NaN
    expect(side('g', 1)).toBeCloseTo(labelGap + measured(wide), 4)
    expect(side('h', 3)).toBeCloseTo(labelGap + measured(wide), 4)
    expect(side('k', 1)).toBeCloseTo(labelGap + measured(narrow) + 2 * platePad * labelSize, 4)
    graph.destroy()
  })

  it('keeps wide side labels off their neighbours in layers', async () => {
    const graph = mount(layers({ nodeSpacing: 8 }))
    await graph.layout.run()
    dom.flushFrames()
    const internals = internalsOf(graph, 'test')
    const frame = internals.containers()
    const keys = internals.scene.nodes.keys
    const boxOf = (item: Item): Box => {
      const at = graph.positions.get(item.id) ?? { x: Number.NaN, y: Number.NaN }
      const index = keys.indexOf(item.id)
      const grouped = items.some((other) => other.parent === item.id)
      const halfWidth = grouped ? (frame?.boxes[index * 4] ?? 0) : 10
      const halfHeight = grouped ? (frame?.boxes[index * 4 + 1] ?? 0) : 10
      return {
        minX: at.x - halfWidth,
        minY: at.y - halfHeight,
        maxX: at.x + halfWidth,
        maxY: at.y + halfHeight,
      }
    }
    const labelOf = (item: Item): Box | null => {
      if (!item.label || !item.side) return null
      const box = boxOf(item)
      const width = measured(item.label) + (item.plated ? 2 * platePad * labelSize : 0)
      const middle = (box.minY + box.maxY) / 2
      const half = (1.25 * labelSize) / 2
      const minX = item.side === 'right' ? box.maxX + labelGap : box.minX - labelGap - width
      return { minX, minY: middle - half, maxX: minX + width, maxY: middle + half }
    }
    const hits: string[] = []
    for (const item of items) {
      const label = labelOf(item)
      if (!label) continue
      for (const other of items) {
        if (other.id === item.id || other.parent === item.id) continue
        if (overlaps(label, boxOf(other))) hits.push(`${item.id} over ${other.id}`)
        const beside = labelOf(other)
        if (beside && overlaps(label, beside)) hits.push(`${item.id} over the label of ${other.id}`)
      }
    }
    expect(hits).toEqual([])
    graph.destroy()
  })
})
