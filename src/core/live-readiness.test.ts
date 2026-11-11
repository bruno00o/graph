import { describe, expect, it, vi } from 'vitest'
import { edges, groups, nodes } from '../marks'
import { LoadingSource } from '../testing/loading-source'
import type { LiveSource } from '../types'
import { createGraphModel } from './graph-model'
import { readinessOf } from './live-source'

type Item = { readonly id: string; readonly group: string }
type Link = { readonly id: string; readonly from: string; readonly to: string }

const item = (id: string, group = 'a'): Item => ({ id, group })
const linkOptions = { source: 'from', target: 'to' } as const

describe('readiness of live sources', () => {
  it('reads the status words of a source or a subscription', () => {
    expect(readinessOf('loading')).toBe('loading')
    expect(readinessOf('loadingSubset')).toBe('loading')
    expect(readinessOf('idle')).toBe('loading')
    expect(readinessOf('error')).toBe('error')
    expect(readinessOf('crashed')).toBe('error')
    expect(readinessOf('ready')).toBe('ready')
    expect(readinessOf('cleaned-up')).toBe('ready')
    expect(readinessOf(undefined)).toBe('ready')
  })

  it('counts a source without a status as loaded once subscribed', () => {
    const plain: LiveSource<Item> = {
      subscribeChanges: (callback) => {
        callback([{ type: 'insert', key: 'a', value: item('a') }])
        return { unsubscribe() {} }
      },
    }
    const model = createGraphModel()
    model.setMarks([nodes(plain), nodes([item('b')])])
    expect(model.loadingSources).toBe(0)
    expect(model.failedSources()).toEqual([])
    model.destroy()
  })

  it('loads until the source says it is ready, batch after batch', () => {
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    const live = new LoadingSource<Item>()
    model.setMarks([nodes(live)])
    expect(model.loadingSources).toBe(1)
    expect(schedule).toHaveBeenCalledTimes(1)
    model.flush()
    live.add(item('a'))
    live.add(item('b'))
    expect(model.loadingSources).toBe(1)
    expect(model.flush().nodes.added).toHaveLength(2)
    const version = model.readinessVersion
    schedule.mockClear()
    live.set('ready')
    expect(model.loadingSources).toBe(0)
    expect(model.readinessVersion).toBeGreaterThan(version)
    expect(schedule).toHaveBeenCalledTimes(1)
    live.set('ready')
    expect(schedule).toHaveBeenCalledTimes(1)
    model.destroy()
  })

  it('counts a source that is ready at once as loaded and schedules nothing more', () => {
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    const live = new LoadingSource<Item>('ready')
    live.add(item('a'))
    model.setMarks([nodes(live)])
    expect(model.loadingSources).toBe(0)
    expect(model.flush().nodes.added).toHaveLength(1)
    schedule.mockClear()
    model.setMarks([nodes(live)])
    expect(schedule).not.toHaveBeenCalled()
    model.destroy()
  })

  it('keeps loading a source that never gets ready', () => {
    const model = createGraphModel()
    const live = new LoadingSource<Item>()
    model.setMarks([nodes(live)])
    live.add(item('a'))
    model.flush()
    expect(model.loadingSources).toBe(1)
    expect(model.node('a')).toBeDefined()
    model.destroy()
  })

  it('lists a failed source until its status recovers', () => {
    const model = createGraphModel()
    const live = new LoadingSource<Item>()
    model.setMarks([nodes(live), edges<Link>([], linkOptions)])
    live.add(item('a'))
    live.set('error')
    expect(model.loadingSources).toBe(0)
    expect(model.failedSources()).toEqual([live])
    model.flush()
    expect(model.node('a')).toBeDefined()
    live.set('ready')
    expect(model.failedSources()).toEqual([])
    model.destroy()
  })

  it('reads the status of the subscription too', () => {
    const model = createGraphModel()
    const live = new LoadingSource<Item>('ready', 'loadingSubset')
    model.setMarks([nodes(live)])
    expect(model.loadingSources).toBe(1)
    live.setSubscription('ready')
    expect(model.loadingSources).toBe(0)
    live.setSubscription('loadingSubset')
    expect(model.loadingSources).toBe(1)
    live.set('error')
    expect(model.loadingSources).toBe(0)
    expect(model.failedSources()).toEqual([live])
    model.destroy()
  })

  it('stops listening to a source replaced while it loads, and follows the new one', () => {
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    const first = new LoadingSource<Item>()
    const second = new LoadingSource<Item>('ready')
    model.setMarks([nodes(first)])
    expect(first.watchers).toBe(1)
    model.setMarks([nodes(second)])
    expect(first.watchers).toBe(0)
    expect(model.loadingSources).toBe(0)
    model.flush()
    schedule.mockClear()
    first.set('ready')
    expect(schedule).not.toHaveBeenCalled()
    const third = new LoadingSource<Item>()
    model.setMarks([nodes(third)])
    expect(model.loadingSources).toBe(1)
    expect(schedule).toHaveBeenCalled()
    model.destroy()
    expect(third.watchers).toBe(0)
  })

  it('stops listening when the plan that subscribed is abandoned', () => {
    const model = createGraphModel()
    const live = new LoadingSource<Item>()
    const broken: LiveSource<Link> = {
      subscribeChanges() {
        throw new Error('no edges')
      },
    }
    expect(() => model.setMarks([nodes(live), edges(broken, linkOptions)])).toThrow('no edges')
    expect(live.watchers).toBe(0)
    expect(model.loadingSources).toBe(0)
    model.destroy()
  })

  it('unsubscribes when listening throws', () => {
    const live = new LoadingSource<Item>()
    const throwing: LiveSource<Item> = {
      subscribeChanges: (callback, options) => live.subscribeChanges(callback, options),
      status: 'loading',
      on() {
        throw new Error('no status')
      },
    }
    const model = createGraphModel()
    expect(() => model.setMarks([nodes(throwing)])).toThrow('no status')
    expect(live.listeners.size).toBe(0)
    model.destroy()
  })

  it('forwards the readiness of the source of groups()', () => {
    const model = createGraphModel()
    const live = new LoadingSource<Item>()
    model.setMarks([groups(live, { by: 'group' })])
    expect(model.loadingSources).toBe(1)
    live.add(item('a'))
    live.set('ready')
    expect(model.loadingSources).toBe(0)
    live.set('error')
    expect(model.failedSources()).toHaveLength(1)
    model.destroy()
    expect(live.watchers).toBe(0)
  })
})
