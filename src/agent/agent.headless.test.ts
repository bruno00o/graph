import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraph } from '../headless'
import { grid } from '../layouts'
import { edges, groups, nodes } from '../marks'
import { createGraphAgent } from './index'
import type { AgentEdge, AgentElement, AgentNode } from './types'

interface Item {
  readonly id: string
  readonly name: string
  readonly team: string
  readonly weight: number
}

interface Link {
  readonly id: string
  readonly source: string
  readonly target: string
}

const names = ['Alpha', 'Bravo', 'Charlie', 'Délta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']

function sample() {
  const items: Item[] = names.map((name, at) => ({
    id: `n${at}`,
    name,
    team: at < 4 ? 'red' : 'blue',
    weight: at + 1,
  }))
  const links: Link[] = items
    .slice(1)
    .map((item, at) => ({ id: `e${at}`, source: `n${Math.floor(at / 2)}`, target: item.id }))
  return { items, links }
}

function definitionOf() {
  const { items, links } = sample()
  return defineGraph({
    marks: [
      nodes(items, {
        name: 'items',
        label: (item) => item.name,
        color: (item) => item.team,
        size: 20,
      }),
      edges(links, { source: (link) => link.source, target: (link) => link.target }),
    ],
    states: { path: { stroke: '#ff0000' }, faded: { opacity: 0.2, others: { opacity: 0.3 } } },
    layout: grid(),
  })
}

async function mounted() {
  const graph = createGraph({ definition: definitionOf(), size: { width: 800, height: 600 } })
  await graph.settled()
  graph.view.fit({ duration: 0 })
  await graph.settled()
  return graph
}

function isNode(element: AgentElement | { more: number }): element is AgentNode {
  return 'kind' in element && element.kind === 'node'
}

function isEdge(element: AgentElement | { more: number }): element is AgentEdge {
  return 'kind' in element && element.kind === 'edge'
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createGraphAgent without a page', () => {
  it('lists what the graph draws, nodes before edges', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const shot = agent.snapshot()
    expect(shot.graph).toMatchObject({ surface: 'none', size: [800, 600] })
    expect(shot.settled).toBe(true)
    expect(shot.counts).toMatchObject({ nodes: 8, edges: 7 })
    expect(shot.view.onScreen).toEqual({ nodes: 8, edges: 7 })
    expect(shot.elements).toHaveLength(15)
    const first = shot.elements.findIndex(isEdge)
    expect(shot.elements.slice(0, first).every(isNode)).toBe(true)
    const alpha = shot.elements.find((each) => isNode(each) && each.key === 'n0') as AgentNode
    expect(alpha).toMatchObject({ label: 'Alpha', size: expect.any(Number), degree: 2 })
    expect(alpha.look.fill).toMatch(/^#[0-9a-f]{6}$/)
    expect(alpha.screen?.[0]).toBeGreaterThan(0)
    graph.destroy()
  })

  it('keeps the first elements and counts the others', async () => {
    const graph = await mounted()
    const shot = createGraphAgent(graph, { limit: 3 }).snapshot()
    expect(shot.elements).toHaveLength(4)
    expect(shot.elements[3]).toEqual({ more: 12 })
    expect(() => createGraphAgent(graph, { limit: 0 })).toThrow(RangeError)
    graph.destroy()
  })

  it('finds elements by text, accents and case ignored, prefixes first', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const found = agent.query({ text: 'delta' })
    expect(found.total).toBe(1)
    expect(found.items[0]).toMatchObject({ kind: 'node', key: 'n3', label: 'Délta' })
    const many = agent.query({ text: 'E', kind: 'node' })
    expect(many.items.map((item) => item.key)).toEqual(['n4', 'n2', 'n3', 'n7'])
    graph.destroy()
  })

  it('pages through matches 50 at a time', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const all = agent.query({ from: 0 })
    expect(all).toMatchObject({ total: 15, from: 0, truncated: false })
    const later = agent.query({ from: 10 })
    expect(later.items).toHaveLength(5)
    expect(() => agent.query({ from: -1 })).toThrow(RangeError)
    graph.destroy()
  })

  it('finds the neighbors of a node', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const near = agent.query({ near: 'n0', kind: 'node' })
    expect(near.items.map((item) => item.key).sort()).toEqual(['n0', 'n1', 'n2'])
    const forward = agent.query({ near: 'n1', direction: 'backward', kind: 'node' })
    expect(forward.items.map((item) => item.key).sort()).toEqual(['n0', 'n1'])
    expect(() => agent.query({ near: 'nope' })).toThrow(/unknown node/)
    graph.destroy()
  })

  it('acts by key and by label, and tells what changed', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const result = await agent.act({
      steps: [
        { action: 'select', target: 'Charlie' },
        { action: 'fit', target: 'selection' },
        { action: 'setState', target: ['n0', 'n1'], args: { name: 'path' } },
      ],
    })
    expect(result.ok).toBe(true)
    expect(result.settled).toBe(true)
    expect(result.changed.selection).toEqual({ nodes: ['n2'], edges: [] })
    expect(result.changed.view?.zoom).toBe(2)
    expect(result.changed.states).toEqual({ path: { nodes: 2, edges: 0 } })
    expect(graph.selection.get().nodes).toEqual(['n2'])
    const after = createGraphAgent(graph).query({ text: 'alpha' }).items[0] as AgentNode
    expect(after.look.stroke).toBe('#ff0000')
    expect(after.states).toEqual(['path'])
    graph.destroy()
  })

  it('stops at the first failing step with candidates', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const result = await agent.act({
      steps: [
        { action: 'select', target: 'n1' },
        { action: 'select', target: 'Char' },
        { action: 'clearSelection' },
      ],
    })
    expect(result.ok).toBe(false)
    expect(result.error).toMatchObject({ step: 1, message: expect.stringMatching(/call query/) })
    expect(result.error?.candidates).toEqual([{ key: 'n2', label: 'Charlie' }])
    expect(result.steps).toEqual([
      { action: 'select', ok: true },
      { action: 'select', ok: false },
    ])
    expect(graph.selection.get().nodes).toEqual(['n1'])
    const unknown = await agent.act({ steps: [{ action: 'hover' as never, target: 'n1' }] })
    expect(unknown.error?.message).toMatch(/unknown action/)
    const state = await agent.act({
      steps: [{ action: 'setState', target: 'n1', args: { name: 'x' } }],
    })
    expect(state.error?.candidates).toEqual(['path', 'faded'])
    graph.destroy()
  })

  it('marks the views and moves it makes with the origin agent', async () => {
    const graph = await mounted()
    const agent = createGraphAgent(graph)
    const views: string[] = []
    const moves: string[] = []
    graph.on('viewchange', ({ origin }) => views.push(origin))
    graph.on('positionchange', ({ origin }) => moves.push(origin))
    await agent.act({
      steps: [
        { action: 'zoom', args: { by: 2 } },
        { action: 'move', target: 'n3', args: { dx: 40 } },
      ],
    })
    graph.view.zoomBy(0.5, { duration: 0 })
    await graph.settled()
    expect(views).toEqual(['agent', 'api'])
    expect(moves).toEqual(['agent'])
    graph.destroy()
  })

  it('tells the changes made by people, code and agents', async () => {
    const graph = await mounted()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const agent = createGraphAgent(graph)
      const changes: { type: string; origin?: string }[] = []
      const stop = agent.subscribe((change) =>
        changes.push({ type: change.type, ...(change.origin ? { origin: change.origin } : {}) }),
      )
      graph.selection.set({ nodes: ['n1'] })
      graph.view.zoomBy(2, { duration: 0 })
      await vi.advanceTimersByTimeAsync(200)
      await agent.act({ steps: [{ action: 'select', target: 'n2' }], wait: false })
      await vi.advanceTimersByTimeAsync(200)
      stop()
      graph.selection.clear()
      expect(changes).toEqual([
        { type: 'selection' },
        { type: 'view', origin: 'api' },
        { type: 'selection', origin: 'agent' },
      ])
      graph.destroy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes and reads back the keys of groups', async () => {
    const { items, links } = sample()
    const graph = createGraph({
      definition: defineGraph({
        marks: [
          nodes(items, { label: (item) => item.name }),
          groups(items, { by: 'team', label: (group) => String(group.value), folded: true }),
          edges(links, { source: (link) => link.source, target: (link) => link.target }),
        ],
        layout: grid(),
      }),
    })
    await graph.settled()
    const agent = createGraphAgent(graph)
    const shot = agent.snapshot()
    expect(shot.folded).toEqual(expect.arrayContaining([{ group: { name: 'team', value: 'red' } }]))
    const groupsFound = agent.query({ kind: 'group' })
    expect(groupsFound.items.map((item) => item.key)).toEqual(
      expect.arrayContaining([{ group: { name: 'team', value: 'blue' } }]),
    )
    const result = await agent.act({
      steps: [{ action: 'unfold', target: { group: { name: 'team', value: 'red' } } }],
    })
    expect(result.ok).toBe(true)
    expect(result.changed.folded).toEqual([{ group: { name: 'team', value: 'blue' } }])
    expect(result.changed.appeared.nodes).toBe(4)
    expect(result.changed.disappeared.nodes).toBe(0)
    graph.destroy()
  })

  it('tells which labels are drawn and why the others are not', async () => {
    const points = [
      { id: 'a', name: 'First label', x: 0, y: 0, small: false },
      { id: 'b', name: 'Second label', x: 0, y: 0, small: false },
      { id: 'c', name: 'Tiny node', x: 300, y: 0, small: true },
      { id: 'd', name: 'Far label', x: 5000, y: 0, small: false },
    ]
    const graph = createGraph({
      definition: defineGraph({
        marks: [
          nodes(points, {
            x: (point) => point.x,
            y: (point) => point.y,
            size: 20,
            label: {
              text: (point) => point.name,
              minScreenSize: (point) => (point.small ? 400 : 0),
            },
          }),
        ],
      }),
      size: { width: 800, height: 600 },
    })
    await graph.settled()
    graph.view.set({ x: 150, y: 0, zoom: 1 }, { duration: 0 })
    await graph.settled()
    const agent = createGraphAgent(graph)
    const shot = agent.snapshot()
    const read = (key: string) =>
      shot.elements.find((each) => isNode(each) && each.key === key) as AgentNode | undefined
    expect(read('a')).toMatchObject({ labelShown: true })
    expect(read('b')).toMatchObject({ labelShown: false, labelHidden: 'overlap' })
    expect(read('c')).toMatchObject({ labelShown: false, labelHidden: 'node-too-small' })
    expect(read('d')).toBeUndefined()
    expect(shot.view.labelsDrawn).toEqual({ nodes: 1, edges: 0 })
    const far = agent.query({ text: 'far' }).items[0]
    expect(far).toMatchObject({ key: 'd', onScreen: false })
    expect(far).not.toHaveProperty('labelShown')
    graph.view.set({ x: 150, y: 0, zoom: 0.1 }, { duration: 0 })
    await graph.settled()
    const small = agent.snapshot().elements.find((each) => isNode(each) && each.key === 'a')
    expect(small).toMatchObject({ labelShown: false, labelHidden: 'too-small' })
    expect(agent.snapshot({ labels: false }).view.labelsDrawn).toBeNull()
    graph.destroy()
  })
})
