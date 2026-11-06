import { describe, expect, it } from 'vitest'
import { defineGraph, edges, type Hull, hull, type Mark, nodes } from './index'

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
    })
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
    expect(defineGraph({ marks: [] }).view).toEqual({ minZoom: 0.001, maxZoom: 64, bounds: null })
    const rect = { minX: -10, minY: -20, maxX: 30, maxY: 40 }
    const limited = defineGraph({ marks: [], view: { minZoom: 0.5, maxZoom: 4, bounds: rect } })
    expect(limited.view).toEqual({ minZoom: 0.5, maxZoom: 4, bounds: rect })
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
})
