import { describe, expect, it, vi } from 'vitest'

vi.mock('@mapbox/tiny-sdf', () => ({
  default: class {
    draw() {
      return {
        data: new Uint8ClampedArray(30 * 34),
        width: 30,
        height: 34,
        glyphWidth: 24,
        glyphHeight: 28,
        glyphTop: 20,
        glyphLeft: 0,
        glyphAdvance: 24,
      }
    }
  },
}))

const { GlyphAtlas, RecentCache } = await import('./glyph-atlas')
const { GlyphBuffer } = await import('./label-layer')

const perAtlas = 33 * 58
const character = (at: number) => String.fromCodePoint(0x4e00 + at)

describe('glyph atlas caches', () => {
  it('forgets the layouts of texts no label shows any more', () => {
    const atlas = new GlyphAtlas('sans-serif', 4096)
    const first = atlas.line('value 0', 500)
    for (let at = 1; at <= 20_000; at++) atlas.line(`value ${at}`, 500)
    expect(atlas.line('value 0', 500)).not.toBe(first)
    expect(atlas.line('value 0', 500)).toEqual(first)
  })

  it('keeps the texts read again while older ones go', () => {
    const cache = new RecentCache<number>(4)
    for (let at = 0; at < 4; at++) cache.set(`k${at}`, at)
    cache.set('k4', 4)
    expect(cache.get('k0')).toBe(0)
    for (let at = 5; at < 8; at++) cache.set(`k${at}`, at)
    cache.set('k8', 8)
    expect(cache.get('k0')).toBe(0)
    expect(cache.get('k1')).toBeUndefined()
    expect(cache.size).toBeLessThanOrEqual(8)
  })
})

describe('glyph atlas overflow', () => {
  it('never points a glyph outside the atlas texture', () => {
    const atlas = new GlyphAtlas('sans-serif', 2048)
    const layouts = Array.from({ length: 2500 }, (_, at) => atlas.line(character(at), 500))
    expect(atlas.height).toBe(2048)
    const last = layouts[layouts.length - 1]
    const glyph = last?.glyphs[0]?.glyph
    expect(glyph).toBeDefined()
    expect((glyph?.y ?? 0) + (glyph?.height ?? 0)).toBeLessThanOrEqual(atlas.height)
    const buffer = new GlyphBuffer()
    buffer.push(0, 0, last ?? { width: 0, glyphs: [] }, atlas.height)
    const uv = new Uint16Array(buffer.data, 24, 4)
    expect(uv[3] ?? 0).toBeGreaterThan(uv[1] ?? 0)
  })

  it('clears itself when full, so the texts asked since then are laid out again', () => {
    const atlas = new GlyphAtlas('sans-serif', 2048)
    const kept = atlas.line(character(0), 500)
    for (let at = 1; at < perAtlas; at++) atlas.line(character(at), 500)
    const generation = atlas.generation
    const next = atlas.line(character(perAtlas), 500)
    expect(atlas.generation).toBe(generation + 1)
    expect(next.glyphs[0]?.glyph.y).toBe(0)
    expect(atlas.line(character(0), 500)).not.toBe(kept)
  })

  it('draws nothing for the characters past a second overflow in one pass', () => {
    const atlas = new GlyphAtlas('sans-serif', 2048)
    for (let at = 0; at <= perAtlas; at++) atlas.line(character(at), 500)
    const generation = atlas.generation
    for (let at = perAtlas + 1; at < perAtlas * 2; at++) atlas.line(character(at), 500)
    const dropped = atlas.line(`${character(perAtlas * 2)}${character(perAtlas * 2 + 1)}`, 500)
    expect(atlas.generation).toBe(generation)
    expect(dropped.glyphs).toEqual([])
    expect(dropped.width).toBe(48)
    expect(atlas.line(`${character(perAtlas * 2)}${character(perAtlas * 2 + 1)}`, 500)).not.toBe(
      dropped,
    )
  })

  it('clears again on a later pass, and waits 8 passes after a pass that overflows it alone', () => {
    const atlas = new GlyphAtlas('sans-serif', 2048)
    for (let at = 0; at <= perAtlas; at++) atlas.line(character(at), 500)
    atlas.settle()
    for (let at = perAtlas + 1; at < perAtlas * 2; at++) atlas.line(character(at), 500)
    const generation = atlas.generation
    atlas.line(character(perAtlas * 2), 500)
    expect(atlas.generation).toBe(generation + 1)
    for (let at = 0; at < perAtlas; at++) atlas.line(character(at), 500)
    atlas.settle()
    const crowded = atlas.generation
    for (let pass = 0; pass < 8; pass++) {
      expect(atlas.line(character(perAtlas * 3 + pass), 500).glyphs).toEqual([])
      atlas.settle()
    }
    expect(atlas.generation).toBe(crowded)
    expect(atlas.line(character(perAtlas * 4), 500).glyphs).toHaveLength(1)
    expect(atlas.generation).toBe(crowded + 1)
  })
})
