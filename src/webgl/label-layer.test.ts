import { describe, expect, it } from 'vitest'
import { NodeColumns, noColor } from '../core/columns'
import { Positions } from '../core/positions'
import type { Glyph, GlyphAtlas, LineLayout } from './glyph-atlas'
import { GlyphBuffer, glyphStride, LabelLayer, labelVisible, sortBySize } from './label-layer'

function columns(entries: readonly { size: number; label: string | null; alive?: boolean }[]) {
  const nodes = new NodeColumns()
  nodes.reserve(entries.length - 1)
  entries.forEach((entry, index) => {
    nodes.alive[index] = entry.alive === false ? 0 : 1
    nodes.size[index] = entry.size
    nodes.label[index] = entry.label
  })
  return nodes
}

describe('labelVisible', () => {
  it('shows labels when no state decides', () => {
    expect(labelVisible(0, new Int8Array(32).fill(-1))).toBe(true)
    expect(labelVisible(0b100, new Int8Array(32).fill(-1))).toBe(true)
  })

  it('lets the lowest active bit with a label flag decide', () => {
    const flags = new Int8Array(32).fill(-1)
    flags[2] = 0
    flags[5] = 1
    expect(labelVisible(1 << 2, flags)).toBe(false)
    expect(labelVisible((1 << 2) | (1 << 5), flags)).toBe(false)
    expect(labelVisible((1 << 5) | 1, flags)).toBe(true)
  })

  it('handles the highest bit', () => {
    const flags = new Int8Array(32).fill(-1)
    flags[31] = 0
    expect(labelVisible(0x80000000, flags)).toBe(false)
  })
})

describe('sortBySize', () => {
  it('orders living labelled nodes from largest to smallest', () => {
    const nodes = columns([
      { size: 8, label: 'a' },
      { size: 32, label: 'b' },
      { size: 16, label: null },
      { size: 64, label: 'd', alive: false },
      { size: 20, label: 'e' },
    ])
    const order = new Uint32Array(nodes.capacity)
    const { length, screenLabels } = sortBySize(nodes, order)
    expect(Array.from(order.subarray(0, length))).toEqual([1, 4, 0])
    expect(screenLabels).toBe(false)
  })
})

describe('GlyphBuffer', () => {
  it('packs one record per glyph and grows', () => {
    const glyph: Glyph = { x: 512, y: 128, width: 10, height: 20, left: 0, top: 4, advance: 9 }
    const line: LineLayout = {
      width: 9 * 300,
      glyphs: Array.from({ length: 300 }, (_, index) => ({ glyph, x: index * 9 })),
    }
    const buffer = new GlyphBuffer()
    buffer.push(7, 1, line, 256)
    expect(buffer.count).toBe(300)
    expect(buffer.data.byteLength).toBeGreaterThanOrEqual(300 * glyphStride)
    const at = 299 * (glyphStride / 4)
    const u32 = new Uint32Array(buffer.data)
    const f32 = new Float32Array(buffer.data)
    const u16 = new Uint16Array(buffer.data)
    expect(u32[at]).toBe(7)
    expect(u32[at + 1]).toBe(1)
    expect(f32[at + 2]).toBe(299 * 9)
    expect(f32[at + 3]).toBe(4)
    expect(Array.from(u16.subarray(at * 2 + 12, at * 2 + 16))).toEqual([
      32768,
      32768,
      Math.round((522 / 1024) * 65535),
      Math.round((148 / 256) * 65535),
    ])
    buffer.clear()
    expect(buffer.count).toBe(0)
  })

  it('forces only hovered and focused labels, other highlighted labels avoid overlaps', () => {
    const glyph: Glyph = { x: 0, y: 0, width: 10, height: 20, left: 0, top: 4, advance: 9 }
    const atlas = {
      height: 256,
      line: (text: string): LineLayout => ({ width: 90, glyphs: [{ glyph, x: text.length }] }),
    } as unknown as GlyphAtlas
    const nodes = columns([
      { size: 16, label: 'selected' },
      { size: 16, label: 'hovered' },
      { size: 16, label: 'also' },
      { size: 16, label: 'apart' },
    ])
    nodes.keys.push('a', 'b', 'c', 'd')
    const positions = new Positions()
    positions.set(0, 0, 0)
    positions.set(1, 0, 0)
    positions.set(2, 0, 0)
    positions.set(3, 0, 200)
    const layer = new LabelLayer()
    layer.select(
      {
        nodes,
        positions,
        view: { x: 0, y: 0, zoom: 1 },
        width: 800,
        height: 600,
        nodeMask: new Uint32Array([0b01, 0b10, 0b01, 0b01]),
        labelFlags: new Int8Array(32).fill(-1),
        highlighted: [0, 1, 2, 3],
        order: new Uint32Array(0),
        orderLength: 0,
        screenLabels: false,
      },
      atlas,
    )
    const placed = new Uint32Array(layer.highlight.data)
    const owners = Array.from(
      { length: layer.highlight.count },
      (_, at) => placed[at * (glyphStride / 4)],
    )
    expect(owners).toEqual([1, 3])
  })

  it('pushes a plate before a labelled node glyphs and keeps the padded box free', () => {
    const glyph: Glyph = { x: 0, y: 0, width: 10, height: 20, left: 0, top: 4, advance: 9 }
    const atlas = {
      height: 256,
      line: (): LineLayout => ({ width: 48, glyphs: [{ glyph, x: 0 }] }),
    } as unknown as GlyphAtlas
    const nodes = columns([
      { size: 16, label: 'plated' },
      { size: 16, label: 'beside' },
    ])
    nodes.keys.push('a', 'b')
    nodes.labelBackground[0] = 5
    nodes.outlineWidth[0] = 4
    expect(nodes.labelBackground[1]).toBe(noColor)
    const positions = new Positions()
    positions.set(0, 0, 0)
    positions.set(1, 30, 0)
    const layer = new LabelLayer()
    const order = new Uint32Array([0, 1])
    layer.select(
      {
        nodes,
        positions,
        view: { x: 0, y: 0, zoom: 1 },
        width: 800,
        height: 600,
        nodeMask: new Uint32Array(2),
        labelFlags: new Int8Array(32).fill(-1),
        highlighted: [],
        order,
        orderLength: 2,
        screenLabels: false,
      },
      atlas,
    )
    const u32 = new Uint32Array(layer.main.data)
    const f32 = new Float32Array(layer.main.data)
    expect(layer.main.count).toBe(2)
    expect(u32[1]).toBe(3 | (5 << 4))
    expect(Array.from(f32.subarray(2, 4))).toEqual([48, 1])
    expect(u32[glyphStride / 4 + 1]).toBe(4)
  })
})
