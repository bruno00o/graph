import { describe, expect, it } from 'vitest'
import { combineExtents, ExtentTracker } from './extent'

describe('ExtentTracker', () => {
  it('follows insertions, updates and deletions', () => {
    const tracker = new ExtentTracker()
    expect(tracker.extent).toBeNull()
    tracker.set(0, 5)
    tracker.set(1, 1)
    tracker.set(2, 9)
    expect(tracker.extent).toEqual([1, 9])
    tracker.delete(2)
    expect(tracker.extent).toEqual([1, 5])
    tracker.set(1, 3)
    expect(tracker.extent).toEqual([3, 5])
    expect([...tracker.ids()]).toEqual([0, 1])
  })

  it('combines extents', () => {
    expect(combineExtents([0, 2], [1, 5])).toEqual([0, 5])
    expect(combineExtents(null, [1, 5])).toEqual([1, 5])
  })
})
