import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageAtlas } from './image-atlas'

function noopGl(): WebGL2RenderingContext {
  return new Proxy({} as WebGL2RenderingContext, {
    get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 0 : () => ({})),
  })
}

const created: string[] = []
let inFlight = 0
let peak = 0
let failing = new Set<string>()
let hold: Array<() => void> | null = null

class FakeImage {
  crossOrigin = ''
  decoding = ''
  src = ''
  naturalWidth = 16
  naturalHeight = 16
  decode(): Promise<void> {
    created.push(this.src)
    inFlight++
    peak = Math.max(peak, inFlight)
    return new Promise<void>((resolve, reject) => {
      const done = (): void => {
        inFlight--
        if (failing.has(this.src)) reject(new Error('failed'))
        else resolve()
      }
      if (hold) hold.push(done)
      else queueMicrotask(done)
    })
  }
}

beforeEach(() => {
  created.length = 0
  inFlight = 0
  peak = 0
  failing = new Set()
  hold = null
  vi.stubGlobal('Image', FakeImage)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ImageAtlas', () => {
  it('loads a queued image once another one frees its place', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    await atlas.settled()
    atlas.flush()
    expect(atlas.layer('a.png')).toBe(0)
    expect(atlas.layer('b.png')).toBe(-1)
    expect(created).toEqual(['a.png'])
    expect(atlas.takeLoaded()).toEqual(new Set(['a.png']))
    atlas.release('a.png')
    await atlas.settled()
    atlas.flush()
    expect(created).toEqual(['a.png', 'b.png'])
    expect(atlas.layer('b.png')).toBe(0)
    expect(atlas.takeLoaded()).toEqual(new Set(['b.png']))
  })

  it('never loads more images than the atlas can hold', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 4)
    for (let i = 0; i < 1000; i++) atlas.acquire(`${i}.png`)
    await atlas.settled()
    atlas.flush()
    await atlas.settled()
    expect(created).toHaveLength(4)
    expect(atlas.layer('3.png')).toBe(3)
    expect(atlas.layer('4.png')).toBe(-1)
  })

  it('bounds the loads in flight', async () => {
    hold = []
    const atlas = new ImageAtlas(noopGl(), () => {}, 64)
    for (let i = 0; i < 200; i++) atlas.acquire(`${i}.png`)
    expect(created).toHaveLength(6)
    for (let round = 0; round < 100 && hold.length > 0; round++) {
      const pending: Array<() => void> = hold
      hold = []
      for (const done of pending) done()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    hold = null
    await atlas.settled()
    expect(peak).toBe(6)
    expect(created).toHaveLength(64)
  })

  it('drops a queued image released before it starts', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    atlas.acquire('c.png')
    atlas.release('b.png')
    await atlas.settled()
    atlas.flush()
    atlas.release('a.png')
    await atlas.settled()
    atlas.flush()
    expect(created).toEqual(['a.png', 'c.png'])
    expect(atlas.layer('c.png')).toBe(0)
    expect(atlas.layer('b.png')).toBe(-1)
  })

  it('loads an image wanted again before the ones queued after it', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    atlas.acquire('c.png')
    atlas.release('b.png')
    atlas.acquire('b.png')
    await atlas.settled()
    atlas.flush()
    atlas.release('a.png')
    await atlas.settled()
    atlas.flush()
    expect(created).toEqual(['a.png', 'b.png'])
    atlas.release('b.png')
    await atlas.settled()
    expect(created).toEqual(['a.png', 'b.png', 'c.png'])
  })

  it('settles while images wait for a place', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 2)
    for (let i = 0; i < 50; i++) atlas.acquire(`${i}.png`)
    await expect(atlas.settled()).resolves.toBeUndefined()
    expect(created).toHaveLength(2)
  })

  it('warns once when images do not fit', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 2)
    for (let i = 0; i < 50; i++) atlas.acquire(`${i}.png`)
    await atlas.settled()
    atlas.flush()
    atlas.release('0.png')
    await atlas.settled()
    atlas.flush()
    const warnings = vi
      .mocked(console.warn)
      .mock.calls.filter(([text]) => /distinct images/.test(String(text)))
    expect(warnings).toHaveLength(1)
  })

  it('does not warn when everything fits', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 4)
    for (let i = 0; i < 4; i++) atlas.acquire(`${i}.png`)
    await atlas.settled()
    atlas.flush()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('moves on from an image that fails to load', async () => {
    failing = new Set(['a.png'])
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    await atlas.settled()
    atlas.flush()
    expect(atlas.layer('a.png')).toBe(-1)
    expect(atlas.layer('b.png')).toBe(0)
  })

  it('discards an image released while it loads', async () => {
    hold = []
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    atlas.release('a.png')
    hold.shift()?.()
    hold = null
    await atlas.settled()
    atlas.flush()
    expect(atlas.layer('a.png')).toBe(-1)
    expect(created).toEqual(['a.png', 'b.png'])
    expect(atlas.layer('b.png')).toBe(0)
  })

  it('ignores wanted images that were released before their turn', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('keep.png')
    for (let i = 0; i < 20000; i++) {
      atlas.acquire(`${i}.png`)
      atlas.release(`${i}.png`)
    }
    await atlas.settled()
    atlas.flush()
    atlas.release('keep.png')
    await atlas.settled()
    expect(created).toEqual(['keep.png'])
  })
})
