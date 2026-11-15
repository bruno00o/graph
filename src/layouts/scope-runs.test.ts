import { afterEach, describe, expect, it, vi } from 'vitest'
import { instantRun, sliced } from './scope-runs'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sliced', () => {
  it('runs the tasks in slices of 8 ms on the main thread', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const done: number[] = []
    for (let task = 0; task < 6; task++) {
      sliced({
        step() {
          clock += 3
          done.push(task)
          return true
        },
      })
    }
    expect(done).toEqual([])
    await Promise.resolve()
    expect(done).toEqual([0, 1, 2])
    await vi.runOnlyPendingTimersAsync()
    expect(done).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('comes back to an unfinished task and skips a stopped one', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let clock = 0
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    let steps = 0
    sliced({
      step(until) {
        while (clock < until) clock += 1
        steps++
        return steps === 3
      },
    })
    const skipped = sliced({ step: () => true })
    skipped.stop()
    const ends: Float32Array[] = []
    instantRun({ xy: new Float32Array(2) }, () => Float32Array.of(1, 2), {
      progress() {},
      end: (xy) => ends.push(xy),
    })
    await Promise.resolve()
    expect(steps).toBe(1)
    await vi.runOnlyPendingTimersAsync()
    expect(steps).toBe(2)
    await vi.runOnlyPendingTimersAsync()
    expect(steps).toBe(3)
    expect(ends).toEqual([])
    await vi.runOnlyPendingTimersAsync()
    expect(ends).toEqual([Float32Array.of(1, 2)])
  })

  it('ends an instant run with the positions it started from when its computation throws', async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => reported.push(error))
    const failure = new Error('boom')
    const ends: Float32Array[] = []
    instantRun(
      { xy: Float32Array.of(3, 4) },
      () => {
        throw failure
      },
      { progress() {}, end: (xy) => ends.push(xy) },
    )
    await Promise.resolve()
    expect(reported).toEqual([failure])
    expect(ends).toEqual([Float32Array.of(3, 4)])
  })
})
