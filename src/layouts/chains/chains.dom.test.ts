import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../../define-graph'
import { createGraphHost, type GraphInstance } from '../../host/mount-graph'
import { edges, nodes } from '../../marks'
import { type FakeDom, fakeRenderer, installDom } from '../../testing/dom'
import { enableScopes } from '../scopes'
import { chains } from './index'

interface Spot {
  readonly id: string
  readonly base?: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const spots: Spot[] = [
  { id: 'a', base: true },
  { id: 'b', base: true },
  { id: 'c' },
  { id: 'd' },
  { id: 'e' },
]

const links: Link[] = [
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
  { id: 'de', from: 'd', to: 'e' },
  { id: 'eb', from: 'e', to: 'b' },
]

let dom: FakeDom

beforeAll(() => {
  enableScopes()
})

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('chains in a mounted graph', () => {
  it('runs on mount, reports layoutend and writes positions', async () => {
    const definition = defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to' }),
        nodes<Spot>(spots, { label: 'id' }),
      ],
      layout: chains<Spot>({ exits: (spot) => spot.base === true }),
      transitions: { layout: 0 },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const graph: GraphInstance = createGraphHost(
      container,
      { definition, ariaLabel: 'chains' },
      fakeRenderer,
    )
    const ended: string[] = []
    graph.on('layoutend', ({ name, completed }) => ended.push(`${name} ${completed}`))
    const done = await graph.layout.run()
    dom.flushFrames()
    expect(done).toBe(true)
    expect(ended[ended.length - 1]).toBe('chains true')
    const a = graph.positions.get('a')
    const b = graph.positions.get('b')
    const c = graph.positions.get('c')
    expect(a && b && c && Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true)
    expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0))).toBeGreaterThan(0)
    graph.destroy()
  })
})
