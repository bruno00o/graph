import { describe, expect, it } from 'vitest'
import { EdgeColumns, NodeColumns, noColor } from '../core/columns'
import { loopMinimum, loopReach } from '../core/edge-curve'
import { Positions } from '../core/positions'
import type { Glyph, GlyphAtlas, LineLayout } from './glyph-atlas'
import {
  type EdgeAnchor,
  edgeAnchor,
  GlyphBuffer,
  glyphStride,
  LabelLayer,
  labelVisible,
  sortBySize,
  sortDescending,
  sortEdgesByWidth,
} from './label-layer'

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

const noEdges = {
  edges: new EdgeColumns(),
  edgeMask: new Uint32Array(0),
  edgeLabelFlags: new Int8Array(32).fill(-1),
  highlightedEdges: [],
  edgeOrder: new Uint32Array(0),
  edgeOrderLength: 0,
  largestEdgeLabel: 0,
}

function links(
  entries: readonly { from: number; to: number; label: string | null; width?: number }[],
) {
  const edges = new EdgeColumns()
  edges.reserve(entries.length - 1)
  entries.forEach((entry, index) => {
    edges.alive[index] = 1
    edges.source[index] = entry.from
    edges.target[index] = entry.to
    edges.width[index] = entry.width ?? 1
    edges.label[index] = entry.label
  })
  return edges
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
        largestLabel: 12,
        ...noEdges,
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

  it('places the labels of a raised free state before larger labels', () => {
    const glyph: Glyph = { x: 0, y: 0, width: 10, height: 20, left: 0, top: 4, advance: 9 }
    const atlas = {
      height: 256,
      line: (): LineLayout => ({ width: 90, glyphs: [{ glyph, x: 0 }] }),
    } as unknown as GlyphAtlas
    const nodes = columns([
      { size: 40, label: 'large' },
      { size: 16, label: 'raised' },
    ])
    nodes.keys.push('a', 'b')
    const positions = new Positions()
    positions.set(0, 0, 0)
    positions.set(1, 0, 0)
    const owners = (raise: number) => {
      const layer = new LabelLayer()
      layer.select(
        {
          nodes,
          positions,
          view: { x: 0, y: 0, zoom: 1 },
          width: 800,
          height: 600,
          nodeMask: new Uint32Array([0, 0b1000]),
          labelFlags: new Int8Array(32).fill(-1),
          highlighted: raise & 0b1000 ? [1] : [],
          raise,
          order: new Uint32Array([0, 1]),
          orderLength: 2,
          screenLabels: false,
          largestLabel: 12,
          ...noEdges,
        },
        atlas,
      )
      const read = (glyphs: GlyphBuffer) => {
        const words = new Uint32Array(glyphs.data)
        return Array.from({ length: glyphs.count }, (_, at) => words[at * (glyphStride / 4)])
      }
      return { main: read(layer.main), highlight: read(layer.highlight) }
    }
    expect(owners(0b111)).toEqual({ main: [0], highlight: [] })
    expect(owners(0b1111)).toEqual({ main: [], highlight: [1] })
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
        largestLabel: 12,
        ...noEdges,
      },
      atlas,
    )
    const u32 = new Uint32Array(layer.main.data)
    const f32 = new Float32Array(layer.main.data)
    expect(layer.main.count).toBe(2)
    expect(u32[1]).toBe(3 | 4)
    expect(u32[8]).toBe(5)
    expect(Array.from(f32.subarray(2, 6))).toEqual([0, 18, expect.closeTo(34.8, 4), 18])
    expect(u32[glyphStride / 4 + 1]).toBe(4)
    expect(u32[glyphStride / 4 + 8]).toBe(noColor)
  })
})

describe('edge labels', () => {
  const glyph: Glyph = { x: 0, y: 0, width: 10, height: 20, left: 0, top: 4, advance: 9 }
  const atlas = {
    height: 256,
    line: (text: string): LineLayout => ({ width: text.length * 12, glyphs: [{ glyph, x: 0 }] }),
  } as unknown as GlyphAtlas
  const view = { x: 0, y: 0, zoom: 1 }

  function frameOf(
    nodes: NodeColumns,
    positions: Positions,
    edges: EdgeColumns,
    extra: { edgeMask?: Uint32Array; highlightedEdges?: number[] } = {},
  ) {
    const order = new Uint32Array(edges.capacity)
    const sorted = sortEdgesByWidth(edges, order)
    return {
      nodes,
      positions,
      view,
      width: 800,
      height: 600,
      nodeMask: new Uint32Array(nodes.capacity),
      labelFlags: new Int8Array(32).fill(-1),
      highlighted: [],
      order: new Uint32Array(0),
      orderLength: 0,
      screenLabels: false,
      largestLabel: 12,
      edges,
      edgeMask: extra.edgeMask ?? new Uint32Array(edges.capacity),
      edgeLabelFlags: new Int8Array(32).fill(-1),
      highlightedEdges: extra.highlightedEdges ?? [],
      edgeOrder: order,
      edgeOrderLength: sorted.length,
      largestEdgeLabel: sorted.largest,
    }
  }

  it('anchors a label between the node borders and keeps it upright', () => {
    const nodes = columns([
      { size: 40, label: null },
      { size: 20, label: null },
    ])
    const positions = new Positions()
    positions.set(0, 100, 0)
    positions.set(1, -100, 0)
    const edges = links([{ from: 0, to: 1, label: 'x' }])
    const anchor: EdgeAnchor = { x: 0, y: 0, ax: 0, ay: 0, room: 0 }
    expect(edgeAnchor({ nodes, edges, positions, view, width: 800, height: 600 }, 0, anchor)).toBe(
      true,
    )
    expect(anchor.x).toBeCloseTo(400 - 5)
    expect(anchor.y).toBeCloseTo(300)
    expect([anchor.ax, anchor.ay]).toEqual([1, -0])
    expect(anchor.room).toBeCloseTo(170)
  })

  it('follows the bend of a parallel edge and the top of a loop', () => {
    const nodes = columns([
      { size: 20, label: null },
      { size: 20, label: null },
    ])
    const positions = new Positions()
    positions.set(0, 0, 0)
    positions.set(1, 200, 0)
    const edges = links([
      { from: 0, to: 1, label: 'x' },
      { from: 0, to: 0, label: 'y' },
    ])
    edges.bend[0] = 0.1
    edges.bend[1] = 1
    const frame = { nodes, edges, positions, view, width: 800, height: 600 }
    const anchor: EdgeAnchor = { x: 0, y: 0, ax: 0, ay: 0, room: 0 }
    edgeAnchor(frame, 0, anchor)
    expect(anchor.x).toBeCloseTo(500)
    expect(anchor.y).toBeCloseTo(320)
    edgeAnchor(frame, 1, anchor)
    const reach = loopReach(10, 1, loopMinimum)
    expect(anchor.x).toBeCloseTo(400 + reach * Math.SQRT1_2)
    expect(anchor.y).toBeCloseTo(300 - reach * Math.SQRT1_2)
    expect(anchor.room).toBe(Number.POSITIVE_INFINITY)
  })

  it('places edge labels that fit, with their plate, and skips overlaps and short edges', () => {
    const nodes = columns([
      { size: 10, label: null },
      { size: 10, label: null },
      { size: 10, label: null },
      { size: 10, label: null },
    ])
    const positions = new Positions()
    positions.set(0, -150, 0)
    positions.set(1, 150, 0)
    positions.set(2, -150, 2)
    positions.set(3, 150, 2)
    const edges = links([
      { from: 0, to: 1, label: 'wide', width: 3 },
      { from: 2, to: 3, label: 'under', width: 1 },
      { from: 0, to: 2, label: 'short', width: 5 },
    ])
    edges.labelBackground[0] = 6
    const layer = new LabelLayer()
    layer.select(frameOf(nodes, positions, edges), atlas)
    const u32 = new Uint32Array(layer.edgeMain.data)
    expect(layer.edgeMain.count).toBe(2)
    expect(u32[0]).toBe(0)
    expect(u32[1]).toBe(3 | 8 | 4)
    expect(u32[8]).toBe(6)
    expect(u32[glyphStride / 4 + 1]).toBe(8 | 4)
  })

  it('forces the hovered edge label into the highlight pass', () => {
    const nodes = columns([
      { size: 10, label: 'over' },
      { size: 10, label: null },
    ])
    const positions = new Positions()
    positions.set(0, 0, -16)
    positions.set(1, 200, 0)
    const edges = links([{ from: 1, to: 0, label: 'hovered' }])
    const layer = new LabelLayer()
    layer.select(
      frameOf(nodes, positions, edges, {
        edgeMask: new Uint32Array([0b10]),
        highlightedEdges: [0],
      }),
      atlas,
    )
    expect(layer.edgeMain.count).toBe(0)
    expect(layer.edgeHighlight.count).toBe(1)
  })
})

describe('sortEdgesByWidth', () => {
  it('orders living labelled edges from widest to thinnest', () => {
    const edges = links([
      { from: 0, to: 1, label: 'a', width: 1 },
      { from: 0, to: 1, label: null, width: 9 },
      { from: 0, to: 1, label: 'c', width: 4 },
      { from: 0, to: 1, label: 'd', width: 4 },
    ])
    const order = new Uint32Array(edges.capacity)
    edges.labelSize[3] = 20
    const { length, largest } = sortEdgesByWidth(edges, order)
    expect(Array.from(order.subarray(0, length))).toEqual([2, 3, 0])
    expect(largest).toBe(20)
  })
})

describe('sortDescending', () => {
  it('orders like a stable sort from largest to smallest', () => {
    let seed = 7
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const values = Float32Array.from({ length: 5000 }, (_, index) =>
      index % 7 === 0 ? 0 : index % 5 === 0 ? 12.5 : next() * 1000,
    )
    const order = Uint32Array.from({ length: 4000 }, (_, index) => index * 1.25)
    const expected = Array.from(order).sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0))
    sortDescending(order, order.length, values)
    expect(Array.from(order)).toEqual(expected)
  })
})

describe('label styles', () => {
  const glyph: Glyph = { x: 0, y: 0, width: 10, height: 20, left: 0, top: 4, advance: 9 }
  const fitted: string[] = []
  const atlas = {
    height: 256,
    line: (text: string): LineLayout => ({ width: text.length * 10, glyphs: [{ glyph, x: 0 }] }),
    fit: (text: string, _weight: number, _font: string | null, width: number) => {
      fitted.push(`${text}:${width}`)
      return text.slice(0, 3)
    },
  } as unknown as GlyphAtlas

  function frameOf(nodes: NodeColumns, positions: Positions, zoom = 1) {
    const order = new Uint32Array(nodes.capacity)
    const sorted = sortBySize(nodes, order)
    return {
      nodes,
      positions,
      view: { x: 0, y: 0, zoom },
      width: 800,
      height: 600,
      nodeMask: new Uint32Array(nodes.capacity),
      labelFlags: new Int8Array(32).fill(-1),
      highlighted: [],
      order,
      orderLength: sorted.length,
      screenLabels: sorted.screenLabels,
      largestLabel: sorted.largest,
      ...noEdges,
    }
  }

  function records(buffer: GlyphBuffer) {
    const u32 = new Uint32Array(buffer.data)
    const f32 = new Float32Array(buffer.data)
    return Array.from({ length: buffer.count }, (_, at) => {
      const base = at * (glyphStride / 4)
      return {
        owner: u32[base],
        kind: u32[base + 1],
        x: f32[base + 2],
        y: f32[base + 3],
        color: u32[base + 8],
        size: f32[base + 9],
      }
    })
  }

  it('stacks explicit lines and aligns them to the placement', () => {
    const nodes = columns([{ size: 20, label: 'ab\nabcd' }])
    nodes.keys.push('a')
    nodes.labelPlacement[0] = 2
    nodes.labelSize[0] = 18
    nodes.labelColor[0] = 7
    const positions = new Positions()
    positions.set(0, 0, 0)
    const layer = new LabelLayer()
    layer.select(frameOf(nodes, positions), atlas)
    const [first, second] = records(layer.main)
    expect(first).toEqual({ owner: 0, kind: 2 << 4, x: 10, y: 4 - 30, color: 7, size: 18 })
    expect(second).toEqual({ owner: 0, kind: 2 << 4, x: 20, y: 4, color: 7, size: 18 })
  })

  it('cuts long lines to the maximum width in atlas units', () => {
    fitted.length = 0
    const nodes = columns([{ size: 20, label: 'abcdef' }])
    nodes.keys.push('a')
    nodes.labelMaxWidth[0] = 60
    nodes.labelSize[0] = 12
    const positions = new Positions()
    positions.set(0, 0, 0)
    new LabelLayer().select(frameOf(nodes, positions), atlas)
    expect(fitted).toEqual(['abcdef:120'])
  })

  it('hides a label while its node is smaller than the threshold on screen, unless hovered', () => {
    const nodes = columns([{ size: 20, label: 'small' }])
    nodes.keys.push('a')
    nodes.labelMinScreenSize[0] = 30
    const positions = new Positions()
    positions.set(0, 0, 0)
    const layer = new LabelLayer()
    layer.select(frameOf(nodes, positions), atlas)
    expect(layer.main.count).toBe(0)
    layer.select(frameOf(nodes, positions, 1.6), atlas)
    expect(layer.main.count).toBe(1)
    layer.select(
      { ...frameOf(nodes, positions), nodeMask: new Uint32Array([0b10]), highlighted: [0] },
      atlas,
    )
    expect(layer.highlight.count).toBe(1)
  })

  it('keeps large labels when zoomed out past the default size', () => {
    const nodes = columns([{ size: 20, label: 'big' }])
    nodes.keys.push('a')
    nodes.labelSize[0] = 24
    const positions = new Positions()
    positions.set(0, 0, 0)
    const layer = new LabelLayer()
    layer.select(frameOf(nodes, positions, 0.5), atlas)
    expect(layer.main.count).toBe(1)
    nodes.labelSize[0] = 0
    layer.select(frameOf(nodes, positions, 0.5), atlas)
    expect(layer.main.count).toBe(0)
  })
})
