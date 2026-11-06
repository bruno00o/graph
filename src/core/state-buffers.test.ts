import { describe, expect, it } from 'vitest'
import { DirtyRange, noPaint, StateBuffers } from './state-buffers'

describe('DirtyRange', () => {
  it('tracks the smallest range and resets on take', () => {
    const range = new DirtyRange()
    expect(range.take()).toBeNull()
    range.add(7)
    range.add(2)
    range.add(5)
    expect(range.take()).toEqual([2, 7])
    expect(range.take()).toBeNull()
  })
})

describe('StateBuffers', () => {
  it('marks only changed masks as dirty', () => {
    const states = new StateBuffers()
    states.reserve(4, 4)
    states.setNode(2, 0b1)
    states.setNode(2, 0b1)
    states.setEdge(3, 0b10)
    expect(states.nodeMask[2]).toBe(1)
    expect(states.nodeDirty.take()).toEqual([2, 2])
    expect(states.edgeDirty.take()).toEqual([3, 3])
    states.setNode(2, 0b1)
    expect(states.nodeDirty.take()).toBeNull()
  })

  it('grows masks past the reserved capacity', () => {
    const states = new StateBuffers()
    states.setNode(100, 0x80000000)
    expect(states.nodeMask[100]).toBe(0x80000000)
  })

  it('writes a style row and clears it with null', () => {
    const states = new StateBuffers()
    const version = states.tableVersion
    states.setStyle('nodes', 3, { opacity: 0.4, halo: true, label: false, stroke: 9 })
    expect(Array.from(states.numbers.subarray(12, 16))).toEqual([expect.closeTo(0.4, 5), -1, 1, 0])
    expect(states.paint[12]).toBe(noPaint)
    expect(states.paint[13]).toBe(9)
    expect(states.labelFlags[3]).toBe(0)
    expect(states.tableVersion).toBe(version + 1)
    states.setStyle('nodes', 3, null)
    expect(Array.from(states.numbers.subarray(12, 16))).toEqual([-1, -1, -1, -1])
    expect(states.paint[13]).toBe(noPaint)
    expect(states.labelFlags[3]).toBe(-1)
  })

  it('packs the outline color and its width as float bits', () => {
    const states = new StateBuffers()
    states.setStyle('nodes', 2, { outline: 7, outlineWidth: 3.5 })
    expect(states.paint[10]).toBe(7)
    expect(new Float32Array(states.paint.buffer, 11 * 4, 1)[0]).toBe(3.5)
    states.setStyle('nodes', 2, { opacity: 1 })
    expect(states.paint[10]).toBe(noPaint)
    expect(states.paint[11]).toBe(noPaint)
  })

  it('writes the label color of a state', () => {
    const states = new StateBuffers()
    states.setStyle('nodes', 1, { labelColor: 12 })
    expect(states.labels[4]).toBe(12)
    states.setStyle('edges', 0, { labelColor: 3 })
    expect(states.labels[32 * 4]).toBe(3)
    states.setStyle('nodes', 1, null)
    expect(states.labels[4]).toBe(noPaint)
  })

  it('keeps edge styles in their own table', () => {
    const states = new StateBuffers()
    states.setStyle('edges', 1, { strokeWidth: 3, label: false, stroke: 4 })
    expect(states.numbers[(32 + 1) * 4 + 1]).toBe(3)
    expect(states.paint[(32 + 1) * 4 + 1]).toBe(4)
    expect(states.numbers[4 + 1]).toBe(-1)
    expect(states.labelFlags[1]).toBe(-1)
    expect(states.edgeLabelFlags[1]).toBe(0)
  })

  it('versions the highlighted lists', () => {
    const states = new StateBuffers()
    states.setHighlighted([1, 2], [0])
    expect(states.highlightedNodes).toEqual([1, 2])
    expect(states.highlightVersion).toBe(1)
  })
})
