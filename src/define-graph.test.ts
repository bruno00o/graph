import { describe, expect, it } from 'vitest'
import { densityBundling } from './bundling'
import {
  defineGraph,
  type EdgeBundling,
  type EdgeRouting,
  edges,
  type Hull,
  hull,
  type LensOptions,
  type Mark,
  nodes,
} from './index'
import { orthogonalRouting } from './routing'

const items = [{ id: 'a' }, { id: 'b' }]
const links = [{ id: 'ab', from: 'a', to: 'b' }]

describe('defineGraph', () => {
  it('keeps the marks in order', () => {
    const edgeMark = edges(links, { source: 'from', target: 'to' })
    const nodeMark = nodes(items)
    expect(defineGraph({ marks: [edgeMark, nodeMark] }).marks).toEqual([edgeMark, nodeMark])
  })

  it('fills interaction defaults', () => {
    expect(defineGraph({ marks: [] }).interaction).toEqual({
      pan: true,
      zoom: { speed: 1 },
      wheel: 'zoom',
      autoPan: { speed: 1 },
      select: 'multiple',
      drag: true,
      lasso: false,
      keyboard: true,
      fold: true,
      lens: { radius: 120, zoom: 3, key: null },
    })
  })

  it('resolves lens options', () => {
    const lens = (option: boolean | LensOptions) =>
      defineGraph({ marks: [], interaction: { lens: option } }).interaction.lens
    expect(lens(true)).toEqual({ radius: 120, zoom: 3, key: 'Alt' })
    expect(lens({ radius: 80, zoom: 4, key: 'z' })).toEqual({ radius: 80, zoom: 4, key: 'z' })
    expect(lens({ key: null }).key).toBeNull()
    expect(() => lens({ radius: 0 })).toThrow(RangeError)
    expect(() => lens({ zoom: 0.5 })).toThrow(RangeError)
  })

  it('resolves zoom options', () => {
    expect(defineGraph({ marks: [], interaction: { zoom: false } }).interaction.zoom).toBe(false)
    expect(
      defineGraph({ marks: [], interaction: { zoom: { speed: 2 } } }).interaction.zoom,
    ).toEqual({
      speed: 2,
    })
  })

  it('resolves the wheel mode and auto-pan', () => {
    const definition = defineGraph({ marks: [], interaction: { wheel: 'page', autoPan: false } })
    expect(definition.interaction.wheel).toBe('page')
    expect(definition.interaction.autoPan).toBe(false)
    expect(
      defineGraph({ marks: [], interaction: { autoPan: { speed: 2 } } }).interaction.autoPan,
    ).toEqual({ speed: 2 })
    expect(() => defineGraph({ marks: [], interaction: { wheel: 'scroll' as 'page' } })).toThrow(
      TypeError,
    )
  })

  it('resolves view limits and rejects invalid ones', () => {
    const padding = { top: 32, right: 32, bottom: 32, left: 32 }
    expect(defineGraph({ marks: [] }).view).toEqual({
      minZoom: 0.001,
      maxZoom: 64,
      bounds: null,
      padding,
      autoFit: 'first',
    })
    const rect = { minX: -10, minY: -20, maxX: 30, maxY: 40 }
    const limited = defineGraph({ marks: [], view: { minZoom: 0.5, maxZoom: 4, bounds: rect } })
    expect(limited.view).toMatchObject({ minZoom: 0.5, maxZoom: 4, bounds: rect })
    expect(Object.isFrozen(limited.view.bounds)).toBe(true)
    expect(defineGraph({ marks: [], view: { bounds: { margin: 80 } } }).view.bounds).toEqual({
      margin: 80,
    })
    expect(() => defineGraph({ marks: [], view: { minZoom: 2, maxZoom: 1 } })).toThrow(RangeError)
    expect(() => defineGraph({ marks: [], view: { minZoom: 0 } })).toThrow(RangeError)
    expect(() => defineGraph({ marks: [], view: { maxZoom: Number.NaN } })).toThrow(RangeError)
    expect(() =>
      defineGraph({ marks: [], view: { bounds: { minX: 1, minY: 0, maxX: 0, maxY: 1 } } }),
    ).toThrow(RangeError)
    expect(() =>
      defineGraph({ marks: [], view: { bounds: { margin: Number.POSITIVE_INFINITY } } }),
    ).toThrow(RangeError)
  })

  it('resolves the padding of fits and the automatic framing', () => {
    const sides = defineGraph({ marks: [], view: { padding: { right: 300, top: 8 } } }).view
    expect(sides.padding).toEqual({ top: 8, right: 300, bottom: 32, left: 32 })
    expect(Object.isFrozen(sides.padding)).toBe(true)
    const even = defineGraph({ marks: [], view: { padding: 0, autoFit: 'layouts' } }).view
    expect(even).toMatchObject({ padding: { top: 0, right: 0, bottom: 0, left: 0 } })
    expect(even.autoFit).toBe('layouts')
    expect(defineGraph({ marks: [], view: { autoFit: undefined } }).view.autoFit).toBe('first')
    expect(() => defineGraph({ marks: [], view: { padding: Number.NaN } })).toThrow(RangeError)
    expect(() =>
      defineGraph({ marks: [], view: { padding: { left: Number.POSITIVE_INFINITY } } }),
    ).toThrow(RangeError)
    const autoFit = 'always' as 'first'
    expect(() => defineGraph({ marks: [], view: { autoFit } })).toThrow(TypeError)
  })

  it('fills transition defaults and clamps negative durations', () => {
    expect(defineGraph({ marks: [] }).transitions).toEqual({ positions: 120, layout: 400 })
    const clamped = defineGraph({ marks: [], transitions: { positions: -5, layout: -1 } })
    expect(clamped.transitions).toEqual({ positions: 0, layout: 0 })
  })

  it('returns a frozen definition', () => {
    const definition = defineGraph({ marks: [nodes(items)], states: { dimmed: { opacity: 0.2 } } })
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.marks)).toBe(true)
    expect(Object.isFrozen(definition.states)).toBe(true)
  })

  it('rejects values that are not marks', () => {
    expect(() => defineGraph({ marks: [{ type: 'lines' } as unknown as Mark] })).toThrow(TypeError)
  })

  it('resolves the background grid', () => {
    expect(defineGraph({ marks: [] }).background).toBeNull()
    expect(defineGraph({ marks: [], background: { grid: 'dots' } }).background).toEqual({
      grid: 'dots',
      spacing: 16,
      color: 'var(--graph-grid)',
      majorColor: 'var(--graph-grid-major)',
      adaptive: true,
    })
    expect(
      defineGraph({ marks: [], background: { grid: 'dots', adaptive: false } }).background
        ?.adaptive,
    ).toBe(false)
    expect(
      defineGraph({ marks: [], background: { grid: 'lines', spacing: -2, color: 'red' } })
        .background,
    ).toMatchObject({ spacing: 16, color: 'red' })
    expect(() => defineGraph({ marks: [], background: { grid: 'squares' as 'lines' } })).toThrow(
      TypeError,
    )
  })

  it('keeps the hulls in order and rejects other values', () => {
    const first = hull({ nodes: ['a'] })
    const second = hull({ state: 'selected' })
    const definition = defineGraph({ marks: [], hulls: [first, second] })
    expect(definition.hulls).toEqual([first, second])
    expect(Object.isFrozen(definition.hulls)).toBe(true)
    expect(() =>
      defineGraph({ marks: [], hulls: [{ nodes: ['a'] } as unknown as Hull<never>] }),
    ).toThrow(TypeError)
  })

  it('keeps the edge bundling and rejects other values', () => {
    expect(defineGraph({ marks: [] }).bundling).toBeNull()
    const bundling = densityBundling({ strength: 0.5 })
    expect(defineGraph({ marks: [], bundling }).bundling).toBe(bundling)
    expect(bundling.strength).toBe(0.5)
    expect(bundling.options).toEqual({ radius: 0.06, iterations: 12 })
    expect(densityBundling({ strength: 4, radius: Number.NaN }).strength).toBe(1)
    expect(densityBundling({ radius: Number.NaN }).options).toEqual({
      radius: 0.06,
      iterations: 12,
    })
    expect(() =>
      defineGraph({ marks: [], bundling: { name: 'other' } as unknown as EdgeBundling }),
    ).toThrow(TypeError)
  })

  it('keeps the edge routing, apart from bundling', () => {
    expect(defineGraph({ marks: [] }).routing).toBeNull()
    const routing = orthogonalRouting({ radius: 4, gap: -3, spacing: Number.NaN })
    expect(defineGraph({ marks: [], routing }).routing).toBe(routing)
    expect(routing.radius).toBe(4)
    expect(routing.options).toEqual({ gap: 0, spacing: 6, axis: 'auto' })
    expect(orthogonalRouting().maxEdges).toBe(50_000)
    expect(() => orthogonalRouting({ axis: 'diagonal' as 'auto' })).toThrow(TypeError)
    expect(() =>
      defineGraph({ marks: [], routing: { name: 'other' } as unknown as EdgeRouting }),
    ).toThrow(TypeError)
    expect(() => defineGraph({ marks: [], routing, bundling: densityBundling() })).toThrow(
      TypeError,
    )
  })

  it('treats options set to undefined as left out', () => {
    const given = defineGraph({
      marks: [],
      scales: { color: undefined, size: undefined },
      states: { muted: { opacity: 0.4, halo: undefined }, selected: { raise: undefined } },
      layout: undefined,
      relayout: undefined,
      interaction: {
        zoom: { speed: undefined },
        autoPan: undefined,
        wheel: undefined,
        lens: { radius: undefined, key: undefined },
      },
      view: { minZoom: undefined, bounds: undefined },
      transitions: { positions: undefined },
      background: { grid: 'dots', spacing: undefined, color: undefined },
      hulls: undefined,
      bundling: undefined,
      routing: undefined,
      bridges: { size: undefined },
      time: { fade: undefined },
      support: undefined,
    })
    const left = defineGraph({
      marks: [],
      scales: {},
      states: { muted: { opacity: 0.4 }, selected: {} },
      interaction: { zoom: {}, lens: {} },
      view: {},
      transitions: {},
      background: { grid: 'dots' },
      bridges: {},
      time: {},
    })
    expect(given).toStrictEqual(left)
    expect(Object.keys(given.states.muted ?? {})).toEqual(['opacity'])
    expect(densityBundling({ radius: undefined, strength: undefined }).options).toEqual(
      densityBundling().options,
    )
    expect(orthogonalRouting({ axis: undefined, gap: undefined }).options).toEqual(
      orthogonalRouting().options,
    )
  })

  it('resolves the bridges', () => {
    expect(defineGraph({ marks: [] }).bridges).toBeNull()
    expect(defineGraph({ marks: [], bridges: false }).bridges).toBeNull()
    expect(defineGraph({ marks: [], bridges: true }).bridges).toEqual({
      shape: 'arc',
      size: 8,
      maxEdges: 100_000,
    })
    expect(
      defineGraph({ marks: [], bridges: { shape: 'gap', size: -1, maxEdges: 10.5 } }).bridges,
    ).toEqual({ shape: 'gap', size: 8, maxEdges: 10 })
    expect(() => defineGraph({ marks: [], bridges: { shape: 'hop' as 'arc' } })).toThrow(TypeError)
  })

  it('limits the number of free states', () => {
    const states = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`s${i}`, { opacity: 0.5 }]),
    )
    expect(() => defineGraph({ marks: [], states })).toThrow(RangeError)
    const { s29: _, ...fewer } = states
    expect(() =>
      defineGraph({ marks: [], states: { ...fewer, selected: { halo: false } } }),
    ).not.toThrow()
  })

  it('checks layer names and their count', () => {
    const link = { source: 'from', target: 'to' } as const
    expect(() => defineGraph({ marks: [edges(links, { ...link, layer: '' })] })).toThrow(TypeError)
    expect(() => defineGraph({ marks: [nodes(items, { layer: 1 as unknown as string })] })).toThrow(
      TypeError,
    )
    const many = Array.from({ length: 129 }, (_, at) =>
      edges(links, { ...link, layer: at === 128 ? 'last' : undefined }),
    )
    expect(() => defineGraph({ marks: many })).toThrow(RangeError)
    expect(() => defineGraph({ marks: many.slice(1) })).not.toThrow()
  })

  it('resolves the support states among the free states', () => {
    const states = { carrier: { halo: true }, carried: { opacity: 0.5 } }
    expect(defineGraph({ marks: [] }).support).toBeNull()
    expect(defineGraph({ marks: [], states, support: { carriers: 'carrier' } }).support).toEqual({
      carriers: 'carrier',
      carried: null,
    })
    expect(defineGraph({ marks: [], states, support: { carried: null } }).support).toBeNull()
    expect(() =>
      defineGraph({
        marks: [],
        states,
        support: { carriers: 'selected' as unknown as 'carrier' },
      }),
    ).toThrow(TypeError)
  })
})
