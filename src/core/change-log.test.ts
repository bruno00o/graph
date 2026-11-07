import { describe, expect, it } from 'vitest'
import { ChangeLog } from './change-log'
import { TimeSpans } from './time-range'

describe('ChangeLog', () => {
  it('records nothing until a reader takes a cursor', () => {
    const log = new ChangeLog()
    log.add(3, 10)
    expect(log.length).toBe(0)
    const cursor = log.cursor()
    log.add(4, 10)
    log.add(7, 10)
    expect([...(log.since(cursor) ?? [])]).toEqual([4, 7])
    expect([...(log.since(log.cursor()) ?? [])]).toEqual([])
  })

  it('starts a new epoch past its limit, so that older cursors read everything again', () => {
    const log = new ChangeLog()
    const cursor = log.cursor()
    for (let index = 0; index < 4096; index++) log.add(index, 100)
    expect(log.since(cursor)?.length).toBe(4096)
    log.add(1, 100)
    expect(log.since(cursor)).toBeNull()
    expect([...(log.since({ epoch: log.epoch, at: 0 }) ?? [])]).toEqual([1])
  })
})

describe('TimeSpans changes', () => {
  it('logs an index only when its span changes', () => {
    const spans = new TimeSpans()
    spans.reserve(8)
    const cursor = spans.changes.cursor()
    spans.set(1, 10, 20)
    spans.set(1, 10, 20)
    spans.clear(2)
    spans.set(2, 5, 5)
    spans.clear(1)
    spans.touch(6)
    expect([...(spans.changes.since(cursor) ?? [])]).toEqual([1, 2, 1, 6])
  })
})
