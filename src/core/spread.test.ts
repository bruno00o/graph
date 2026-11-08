import { describe, expect, it } from 'vitest'
import { offsetAt, type PackInput, type Packing, packMembers, spreadStep, stepZoom } from './spread'

interface Member {
  readonly x: number
  readonly y: number
  readonly r?: number
  readonly s?: number
}

function input(members: readonly Member[], gap = 4): PackInput {
  return {
    count: members.length,
    x: Float64Array.from(members, (member) => member.x),
    y: Float64Array.from(members, (member) => member.y),
    radius: Float64Array.from(members, (member) => member.r ?? 5),
    scale: Float64Array.from(members, (member) => member.s ?? 1),
    gap,
  }
}

function placed(packing: Packing, member: number, scale = 1): readonly [number, number] {
  const id = packing.packOf[member] ?? -1
  return [
    (packing.anchorX[id] ?? 0) + (packing.offsetX[member] ?? 0) / scale,
    (packing.anchorY[id] ?? 0) + (packing.offsetY[member] ?? 0) / scale,
  ]
}

function closest(packing: Packing, members: readonly Member[], scale = 1): number {
  let least = Number.POSITIVE_INFINITY
  for (let a = 0; a < members.length; a++) {
    for (let b = a + 1; b < members.length; b++) {
      const [ax, ay] = placed(packing, a, scale)
      const [bx, by] = placed(packing, b, scale)
      const room = (members[a]?.r ?? 5) + (members[b]?.r ?? 5)
      least = Math.min(least, Math.hypot(ax - bx, ay - by) * scale - room)
    }
  }
  return least
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

describe('offsetAt', () => {
  it('puts two to six members on a ring, the first on top', () => {
    for (let size = 2; size <= 6; size++) {
      const [x, y] = offsetAt(0, size, 10)
      expect(x).toBeCloseTo(0, 9)
      expect(y).toBeLessThan(0)
      const points = Array.from({ length: size }, (_, at) => offsetAt(at, size, 10))
      for (let a = 0; a < size; a++) {
        const [ax = 0, ay = 0] = points[a] ?? []
        const [bx = 0, by = 0] = points[(a + 1) % size] ?? []
        expect(Math.hypot(ax - bx, ay - by)).toBeCloseTo(10, 9)
      }
    }
  })

  it('keeps one pitch between the members of a spiral', () => {
    for (const size of [7, 20, 300]) {
      const points = Array.from({ length: size }, (_, at) => offsetAt(at, size, 10))
      let least = Number.POSITIVE_INFINITY
      for (let a = 0; a < size; a++) {
        for (let b = a + 1; b < size; b++) {
          const [ax = 0, ay = 0] = points[a] ?? []
          const [bx = 0, by = 0] = points[b] ?? []
          least = Math.min(least, Math.hypot(ax - bx, ay - by))
        }
      }
      expect(least).toBeGreaterThanOrEqual(10 - 1e-9)
    }
  })

  it('leaves a single member in place', () => {
    expect(offsetAt(0, 1, 10)).toEqual([0, 0])
  })
})

describe('packMembers', () => {
  it('packs members at the same place, +0 and -0 alike, and skips the ones without a place', () => {
    const members = [
      { x: 0, y: 0 },
      { x: -0, y: 0 },
      { x: Number.NaN, y: 0 },
      { x: 0, y: -0 },
      { x: 1000, y: 1000 },
    ]
    const packing = packMembers(input(members))
    expect(packing.packOf[2]).toBe(-1)
    expect(packing.packOf[0]).toBe(packing.packOf[1])
    expect(packing.packOf[0]).toBe(packing.packOf[3])
    expect(packing.size[packing.packOf[0] ?? 0]).toBe(3)
    expect(packing.size[packing.packOf[4] ?? 0]).toBe(1)
    expect(placed(packing, 4)).toEqual([1000, 1000])
    const [x, y] = placed(packing, 0)
    expect(x).toBeCloseTo(0, 9)
    expect(y).toBeLessThan(0)
  })

  it('packs neighbors closer than their radii and the gap, and links them transitively', () => {
    const members = [
      { x: 0, y: 0 },
      { x: 13.9, y: 0 },
      { x: 27.8, y: 0 },
      { x: 42, y: 0 },
    ]
    const packing = packMembers(input(members))
    expect(packing.packOf[0]).toBe(packing.packOf[1])
    expect(packing.packOf[1]).toBe(packing.packOf[2])
    expect(packing.packOf[3]).not.toBe(packing.packOf[0])
  })

  it('places a pack around the mean of its members, in the order given', () => {
    const members = [
      { x: 10, y: 0 },
      { x: 12, y: 0 },
    ]
    const packing = packMembers(input(members))
    const id = packing.packOf[0] ?? 0
    expect(packing.anchorX[id]).toBe(11)
    expect(packing.anchorY[id]).toBe(0)
    expect(packing.offsetY[0]).toBeLessThan(0)
    expect(packing.offsetY[1]).toBeGreaterThan(0)
    expect(Math.hypot(packing.offsetX[0] ?? 0, packing.offsetY[0] ?? 0)).toBeCloseTo(7, 9)
  })

  it('takes the widest member and the gap as the pitch', () => {
    const members = [
      { x: 0, y: 0, r: 5 },
      { x: 0, y: 0, r: 10 },
    ]
    const packing = packMembers(input(members, 6))
    const [ax, ay] = placed(packing, 0)
    const [bx, by] = placed(packing, 1)
    expect(Math.hypot(ax - bx, ay - by)).toBeCloseTo(26, 9)
  })

  it('measures distances in pack units through the scale', () => {
    const members = [
      { x: 0, y: 0, s: 1 },
      { x: 1, y: 0, s: 1 },
    ]
    expect(packMembers(input(members)).packs).toBe(1)
    const far = members.map((member) => ({ ...member, s: 20 }))
    expect(packMembers(input(far)).packs).toBe(2)
  })

  it('merges packs whose discs overlap, so that no two members overlap', () => {
    const members: Member[] = []
    for (let k = 0; k < 6; k++) members.push({ x: 0, y: 0 })
    for (let k = 0; k < 6; k++) members.push({ x: 30, y: 0 })
    members.push({ x: 15, y: 18 })
    const packing = packMembers(input(members))
    expect(packing.packs).toBe(1)
    expect(closest(packing, members)).toBeGreaterThanOrEqual(4 - 1e-9)
  })

  it('leaves no overlap in random crowds', () => {
    const next = random(7)
    for (let round = 0; round < 20; round++) {
      const members: Member[] = []
      const count = 20 + Math.floor(next() * 80)
      for (let k = 0; k < count; k++) {
        const stacked = next() < 0.4 && members.length > 0
        const other = members[Math.floor(next() * members.length)]
        members.push(
          stacked && other
            ? { x: other.x, y: other.y, r: 2 + next() * 6 }
            : { x: next() * 400, y: next() * 400, r: 2 + next() * 6 },
        )
      }
      const packing = packMembers(input(members), 6)
      expect(closest(packing, members)).toBeGreaterThan(-1e-6)
    }
  })

  it('gives the same packs for the same input', () => {
    const next = random(11)
    const members = Array.from({ length: 200 }, () => ({
      x: Math.floor(next() * 40) * 5,
      y: Math.floor(next() * 40) * 5,
    }))
    const a = packMembers(input(members))
    const b = packMembers(input(members))
    expect(a.packOf).toEqual(b.packOf)
    expect(a.offsetX).toEqual(b.offsetX)
    expect(a.anchorY).toEqual(b.anchorY)
  })

  it('handles a crowd of thousands at one place and nearby without pairing them all', () => {
    const next = random(3)
    const members = Array.from({ length: 20_000 }, (_, k) =>
      k % 2 === 0 ? { x: 100, y: 100 } : { x: 100 + next() * 2, y: 100 + next() * 2 },
    )
    const started = performance.now()
    const packing = packMembers(input(members))
    expect(performance.now() - started).toBeLessThan(2000)
    expect(packing.packs).toBe(1)
  })

  it('keeps separate places at a large scale apart', () => {
    const members = [
      { x: 0, y: 0, s: 2 ** 20 },
      { x: 1e-4, y: 0, s: 2 ** 20 },
      { x: 2e-4, y: 0, s: 2 ** 20 },
    ]
    expect(packMembers(input(members)).packs).toBe(3)
  })
})

describe('spreadStep', () => {
  it('steps by a quarter octave, with some slack around each step', () => {
    expect(spreadStep(1, null)).toBe(0)
    expect(spreadStep(2, null)).toBe(4)
    expect(spreadStep(2 ** (0.6 / 4), 0)).toBe(0)
    expect(spreadStep(2 ** (0.7 / 4), 0)).toBe(1)
    expect(spreadStep(2 ** (-0.6 / 4), 0)).toBe(0)
    expect(spreadStep(2 ** (-0.7 / 4), 0)).toBe(-1)
    expect(spreadStep(2 ** (0.45 / 4), 1)).toBe(1)
    expect(stepZoom(4)).toBe(2)
  })
})
