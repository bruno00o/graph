import { describe, expect, it, vi } from 'vitest'
import type { LayoutEndOptions, LayoutListener, LayoutRun } from '../../types'
import { type ForceGraph, forceDefaults } from './simulation'
import { type UntangleJob, type UntangleStage, untangling } from './untangle-stage'

const graph: ForceGraph = {
  capacity: 3,
  alive: Uint8Array.of(1, 1, 1),
  movable: Uint8Array.of(1, 1, 1),
  xy: Float32Array.of(0, 0, 10, 0, 20, 0),
  radius: new Float32Array(3).fill(5),
  edges: Uint32Array.of(0, 1, 1, 2),
}

function fakeJob(rounds: number, moved = true, skipped = false) {
  const pins: (readonly [number, number, number])[] = []
  let left = rounds
  const job: UntangleJob = {
    skipped,
    moved,
    pin: (index, x, y) => pins.push([index, x, y]),
    advance: () => --left <= 0,
    result: () => Float32Array.of(1, 2, 3, 4, 5, 6),
  }
  return { job, pins }
}

function setup(job: UntangleJob, untangle = 300, load?: UntangleStage['load']) {
  const tasks: (() => void)[] = []
  const ends: [number[], LayoutEndOptions | undefined][] = []
  const progress: number[] = []
  const dense = vi.fn()
  const listener: LayoutListener = {
    progress: (_, value) => progress.push(value),
    end: (xy, options) => ends.push([Array.from(xy), options]),
  }
  const stage: UntangleStage = {
    slice: 8,
    schedule: (task) => tasks.push(task),
    load: load ?? (() => () => job),
    dense,
  }
  let inner: LayoutListener | null = null
  const forces: LayoutRun & { pins: number[]; stopped: boolean } = {
    pins: [],
    stopped: false,
    pin(index) {
      this.pins.push(index)
    },
    stop() {
      this.stopped = true
    },
  }
  const run = untangling(graph, { ...forceDefaults, untangle }, listener, stage, (given) => {
    inner = given
    return forces
  })
  const drain = async () => {
    for (let k = 0; k < 50; k++) {
      await Promise.resolve()
      tasks.shift()?.()
    }
  }
  return { run, ends, progress, dense, forces, drain, inner: () => inner as LayoutListener }
}

describe('untangling', () => {
  it('hands the listener over when the pass is off', () => {
    const { job } = fakeJob(1)
    const listener: LayoutListener = { progress() {}, end() {} }
    let given: LayoutListener | null = null
    untangling(
      graph,
      { ...forceDefaults, untangle: 0 },
      listener,
      {
        slice: 8,
        schedule: () => {},
        load: () => () => job,
        dense: () => {},
      },
      (inner) => {
        given = inner
        return { pin() {}, stop() {} }
      },
    )
    expect(given).toBe(listener)
  })

  it('ends with the untangled positions and asks for a glide', async () => {
    const { job } = fakeJob(3)
    const { ends, progress, inner, drain } = setup(job)
    inner().progress(Float32Array.of(0, 0, 0, 0, 0, 0), 0.5)
    inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    expect(ends).toEqual([])
    await drain()
    expect(progress).toEqual([0.5])
    expect(ends).toEqual([[[1, 2, 3, 4, 5, 6], { glide: true }]])
  })

  it('ends with the positions of the forces when nothing moved, or on a dense graph', async () => {
    const quiet = setup(fakeJob(1, false).job)
    quiet.inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    await quiet.drain()
    expect(quiet.ends).toEqual([[[9, 9, 9, 9, 9, 9], undefined]])
    expect(quiet.dense).not.toHaveBeenCalled()
    const dense = setup(fakeJob(1, false, true).job)
    dense.inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    await dense.drain()
    expect(dense.ends).toEqual([[[9, 9, 9, 9, 9, 9], undefined]])
    expect(dense.dense).toHaveBeenCalledOnce()
  })

  it('passes pins to the forces, then to the pass', async () => {
    const { job, pins } = fakeJob(3)
    const { run, forces, inner, drain } = setup(job)
    run.pin(1, 5, 6)
    expect(forces.pins).toEqual([1])
    inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    await drain()
    expect(pins).toEqual([[1, 5, 6]])
  })

  it('stops the forces, and the pass, without ending', async () => {
    const { job } = fakeJob(5)
    const { run, forces, ends, inner, drain } = setup(job)
    inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    run.stop()
    await drain()
    expect(forces.stopped).toBe(true)
    expect(ends).toEqual([])
  })

  it('waits for a pass loaded on demand, and ends without it when loading fails', async () => {
    const { job } = fakeJob(1)
    const later = setup(job, 300, () => Promise.resolve(() => job))
    later.inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    await later.drain()
    expect(later.ends).toEqual([[[1, 2, 3, 4, 5, 6], { glide: true }]])
    const failed = setup(job, 300, () => Promise.reject(new Error('offline')))
    failed.inner().end(Float32Array.of(9, 9, 9, 9, 9, 9))
    await failed.drain()
    expect(failed.ends).toEqual([[[9, 9, 9, 9, 9, 9], undefined]])
  })
})
