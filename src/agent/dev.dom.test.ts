import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphInstance } from '../host/graph-instance'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'

class FakeSource extends EventTarget {
  static last: FakeSource | null = null
  readonly url: string
  closed = false

  constructor(url: string) {
    super()
    this.url = url
    FakeSource.last = this
  }

  close() {
    this.closed = true
  }

  send(id: string, route: string, body: Record<string, unknown> = {}) {
    this.dispatchEvent(new MessageEvent('command', { data: JSON.stringify({ id, route, body }) }))
  }
}

interface Posted {
  readonly route: string
  readonly body: {
    readonly id?: string
    readonly ok?: boolean
    readonly result?: Record<string, unknown>
    readonly error?: string
    readonly page?: { readonly url: string }
  }
}

let dom: FakeDom
let posted: Posted[]
const holder = Symbol.for('@bruno00o/graph/agent/dev')

async function mount(): Promise<GraphInstance> {
  const { defineGraph } = await import('../define-graph')
  const { createGraphHost } = await import('../host/mount-graph')
  const { edges, nodes } = await import('../marks')
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          nodes(
            [
              { id: 'a', x: 0, y: 0, name: 'Alpha' },
              { id: 'b', x: 80, y: 0, name: 'Bravo' },
            ],
            { x: 'x', y: 'y', label: 'name' },
          ),
          edges([{ id: 'ab', from: 'a', to: 'b' }], { source: 'from', target: 'to' }),
        ],
      }),
      ariaLabel: 'Client graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

async function reply(id: string): Promise<Posted['body']> {
  for (let turn = 0; turn < 100; turn++) {
    const found = posted.find((each) => each.route === 'reply' && each.body.id === id)
    if (found) return found.body
    dom.flushFrames()
    await new Promise((done) => setTimeout(done, 5))
  }
  throw new Error(`no reply to ${id}`)
}

beforeEach(() => {
  dom = installDom()
  posted = []
  vi.resetModules()
  vi.stubGlobal('EventSource', FakeSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string }) => {
      posted.push({ route: url.replace('/__graph/', ''), body: JSON.parse(init.body) })
      return new Response('{}')
    }),
  )
})

afterEach(() => {
  ;(globalThis as { [holder]?: { stop(): void } })[holder]?.stop()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  dom.restore()
})

describe('the dev client of the agent bridge', () => {
  it('answers for a graph mounted after it loads', async () => {
    await import('./dev')
    const source = FakeSource.last as FakeSource
    expect(source.url).toMatch(/^\/__graph\/events\?tab=/)
    const graph = await mount()
    source.send('1', 'snapshot', { wait: false })
    const answer = await reply('1')
    expect(answer.ok).toBe(true)
    expect(answer.result).toMatchObject({
      graph: { id: 0, label: 'Client graph' },
      counts: { nodes: 2, edges: 1 },
    })
    expect(answer.page?.url).toBe(location.href)
    source.send('2', 'act', { steps: [{ action: 'select', target: 'Bravo' }], wait: false })
    expect((await reply('2')).result).toMatchObject({ ok: true, graph: 0 })
    expect(graph.selection.get().nodes).toEqual(['b'])
    source.send('3', 'changes', {})
    const changes = (await reply('3')).result as { changes: { type: string; origin?: string }[] }
    expect(changes.changes).toContainEqual(
      expect.objectContaining({ type: 'selection', origin: 'agent', graph: 0 }),
    )
    graph.destroy()
  })

  it('reports page errors and unknown routes', async () => {
    await import('./dev')
    const source = FakeSource.last as FakeSource
    await mount()
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', error: new TypeError('boom') }))
    source.send('1', 'errors')
    expect((await reply('1')).result).toMatchObject({
      errors: [{ kind: 'error', message: 'TypeError: boom' }],
    })
    source.send('2', 'nothing')
    expect(await reply('2')).toMatchObject({ ok: false, error: 'unknown route nothing' })
  })

  it('stops the previous client when it loads again', async () => {
    await import('./dev')
    const first = FakeSource.last as FakeSource
    vi.resetModules()
    await import('./dev')
    expect(first.closed).toBe(true)
    expect(FakeSource.last).not.toBe(first)
  })
})
