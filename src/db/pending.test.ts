import { afterEach, describe, expect, it, vi } from 'vitest'
import { pace } from './pending'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pace', () => {
  it('keeps its pace when the clock of the system steps back', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    const run = vi.fn()
    const paced = pace(50, run)
    paced.call()
    expect(run).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() - 60 * 60 * 1000)
    paced.call()
    vi.advanceTimersByTime(50)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('waits longer than a timer can wait without firing early', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const run = vi.fn()
    const paced = pace(2 ** 33, run)
    paced.call()
    paced.call()
    for (const call of spy.mock.calls) expect(call[1] ?? 0).toBeLessThanOrEqual(2 ** 31 - 1)
    vi.advanceTimersByTime(2 ** 32)
    expect(run).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2 ** 32)
    expect(run).toHaveBeenCalledTimes(2)
    paced.cancel()
  })
})
