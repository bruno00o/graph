import { describe, expect, it } from 'vitest'
import { defineGraph, edges, type Mark, nodes } from './index'

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
      select: 'multiple',
      drag: true,
      lasso: false,
      keyboard: true,
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

  it('returns a frozen definition', () => {
    const definition = defineGraph({ marks: [nodes(items)], states: { dimmed: { opacity: 0.2 } } })
    expect(Object.isFrozen(definition)).toBe(true)
    expect(Object.isFrozen(definition.marks)).toBe(true)
    expect(Object.isFrozen(definition.states)).toBe(true)
  })

  it('rejects values that are not marks', () => {
    expect(() => defineGraph({ marks: [{ type: 'lines' } as unknown as Mark] })).toThrow(TypeError)
  })
})
