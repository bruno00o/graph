import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import { StateBuffers } from '../core/state-buffers'
import { edges, nodes } from '../marks'
import { StateRegistry } from './state-registry'

function setup(keys: readonly string[]) {
  const model = createGraphModel()
  model.setMarks([
    nodes(keys.map((id) => ({ id }))),
    edges([{ id: 'ab', source: 'a', target: 'b' }], { source: 'source', target: 'target' }),
  ])
  const changes = model.flush()
  const buffers = new StateBuffers()
  const registry = new StateRegistry(model, buffers)
  registry.define(['muted', 'pinned'])
  registry.apply(changes)
  return { model, buffers, registry }
}

describe('StateRegistry', () => {
  it('assigns built-in bits first, then free states in order', () => {
    const { registry } = setup(['a'])
    expect(registry.names).toEqual(['selected', 'hovered', 'focused', 'muted', 'pinned'])
    expect(registry.bit('pinned')).toBe(4)
  })

  it('writes one bit per state into the element mask', () => {
    const { model, buffers, registry } = setup(['a', 'b'])
    registry.set('selected', { nodes: ['a'] })
    registry.add('pinned', { nodes: ['a', 'missing'], edges: ['ab'] })
    const a = model.node('a')?.index ?? -1
    const ab = model.edge('ab')?.index ?? -1
    expect(buffers.nodeMask[a]).toBe(0b10001)
    expect(buffers.edgeMask[ab]).toBe(0b10000)
    registry.remove('pinned', { nodes: ['a'] })
    expect(buffers.nodeMask[a]).toBe(0b1)
  })

  it('lists selected and hovered elements for the overlay pass', () => {
    const { model, buffers, registry } = setup(['a', 'b'])
    registry.set('selected', { nodes: ['a'], edges: ['ab'] })
    registry.set('hovered', { nodes: ['b'] })
    registry.takeHighlighted()
    expect(buffers.highlightedNodes).toEqual([model.node('a')?.index, model.node('b')?.index])
    expect(buffers.highlightedEdges).toEqual([model.edge('ab')?.index])
    const version = buffers.highlightVersion
    registry.set('muted', { nodes: ['a'] })
    registry.takeHighlighted()
    expect(buffers.highlightVersion).toBe(version)
  })

  it('applies free states to elements that arrive later', () => {
    const model = createGraphModel()
    const buffers = new StateBuffers()
    const registry = new StateRegistry(model, buffers)
    registry.define(['muted'])
    registry.set('muted', { nodes: ['late'] })
    model.setMarks([nodes([{ id: 'late' }])])
    registry.apply(model.flush())
    expect(buffers.nodeMask[model.node('late')?.index ?? -1]).toBe(0b1000)
  })

  it('remaps members when the declared states change', () => {
    const { model, buffers, registry } = setup(['a'])
    registry.set('pinned', { nodes: ['a'] })
    expect(registry.define(['pinned'])).toBe(true)
    expect(registry.members('pinned').nodes).toEqual(['a'])
    expect(buffers.nodeMask[model.node('a')?.index ?? -1]).toBe(0b1000)
    expect(() => registry.members('muted')).toThrow('unknown state')
    expect(registry.define(['pinned'])).toBe(false)
  })
})
