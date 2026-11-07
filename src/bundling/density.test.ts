import { describe, expect, it } from 'vitest'
import { DensityBundler, densityDefaults } from './density'

function lanes(count: number, gap: number): { xy: Float32Array; ends: Uint32Array } {
  const xy = new Float32Array(count * 4)
  const ends = new Uint32Array(count * 2)
  for (let lane = 0; lane < count; lane++) {
    xy.set([0, lane * gap, 1000, lane * gap], lane * 4)
    ends.set([lane * 2, lane * 2 + 1], lane * 2)
  }
  return { xy, ends }
}

function middle(paths: { offsets: Uint32Array; points: Float32Array }, edge: number): number {
  const first = paths.offsets[edge] ?? 0
  const last = (paths.offsets[edge + 1] ?? 0) - 1
  return paths.points[Math.round((first + last) / 2) * 2 + 1] ?? 0
}

describe('DensityBundler', () => {
  it('pulls neighboring edges together and keeps their ends', () => {
    const { xy, ends } = lanes(6, 40)
    const paths = new DensityBundler(xy, ends, densityDefaults).run()
    expect(paths.offsets).toHaveLength(7)
    const spread = middle(paths, 5) - middle(paths, 0)
    expect(spread).toBeLessThan(200 * 0.6)
    for (let edge = 0; edge < 6; edge++) {
      const first = paths.offsets[edge] ?? 0
      const last = (paths.offsets[edge + 1] ?? 0) - 1
      expect(paths.points[first * 2]).toBe(0)
      expect(paths.points[first * 2 + 1]).toBe(edge * 40)
      expect(paths.points[last * 2]).toBe(1000)
      expect(paths.points[last * 2 + 1]).toBe(edge * 40)
    }
  })

  it('leaves edges straight without passes', () => {
    const { xy, ends } = lanes(3, 40)
    const paths = new DensityBundler(xy, ends, { radius: 0.06, iterations: 0 }).run()
    for (let edge = 0; edge < 3; edge++) expect(middle(paths, edge)).toBeCloseTo(edge * 40)
  })

  it('gives the same paths for the same input', () => {
    const { xy, ends } = lanes(5, 30)
    const first = new DensityBundler(xy, ends, densityDefaults).run()
    const second = new DensityBundler(xy, ends, densityDefaults).run()
    expect(second.points).toEqual(first.points)
  })

  it('keeps a lone edge straight and samples it by its length', () => {
    const xy = new Float32Array([0, 0, 1000, 0, 0, 500, 5, 500])
    const ends = new Uint32Array([0, 1, 2, 3])
    const bundler = new DensityBundler(xy, ends, densityDefaults)
    expect((bundler.offsets[2] ?? 0) - (bundler.offsets[1] ?? 0)).toBe(2)
    const paths = bundler.run()
    expect(middle(paths, 0)).toBeCloseTo(0)
    expect(bundler.progress).toBe(1)
  })

  it('works in slices and gives the same paths', () => {
    const { xy, ends } = lanes(300, 3)
    const whole = new DensityBundler(xy, ends, densityDefaults).run()
    const bundler = new DensityBundler(xy, ends, densityDefaults)
    let slices = 0
    while (!bundler.done) {
      bundler.step(performance.now() - 1)
      slices++
    }
    expect(slices).toBeGreaterThan(densityDefaults.iterations * 4)
    expect(bundler.paths().points).toEqual(whole.points)
  })

  it('runs one whole pass per step without a deadline', () => {
    const { xy, ends } = lanes(300, 3)
    const bundler = new DensityBundler(xy, ends, densityDefaults)
    bundler.step()
    expect(bundler.progress).toBeCloseTo(1 / densityDefaults.iterations)
  })
})
