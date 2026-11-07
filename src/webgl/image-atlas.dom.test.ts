import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageAtlas } from './image-atlas'

function noopGl(): WebGL2RenderingContext {
  return new Proxy({} as WebGL2RenderingContext, {
    get: (_, name) => (typeof name === 'string' && /^[A-Z_0-9]+$/.test(name) ? 0 : () => ({})),
  })
}

class LoadedImage {
  crossOrigin = ''
  decoding = ''
  src = ''
  naturalWidth = 16
  naturalHeight = 16
  decode(): Promise<void> {
    return Promise.resolve()
  }
}

beforeEach(() => {
  vi.stubGlobal('Image', LoadedImage)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ImageAtlas', () => {
  it('stores a waiting image once another one frees its place', async () => {
    const invalidate = vi.fn()
    const atlas = new ImageAtlas(noopGl(), invalidate, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    await atlas.settled()
    atlas.flush()
    expect(atlas.layer('a.png')).toBe(0)
    expect(atlas.layer('b.png')).toBe(-1)
    expect(atlas.takeLoaded()).toEqual(new Set(['a.png']))
    invalidate.mockClear()
    atlas.release('a.png')
    expect(invalidate).toHaveBeenCalledTimes(1)
    atlas.flush()
    expect(atlas.layer('b.png')).toBe(0)
    expect(atlas.takeLoaded()).toEqual(new Set(['b.png']))
  })

  it('forgets a waiting image released before a place frees', async () => {
    const atlas = new ImageAtlas(noopGl(), () => {}, 1)
    atlas.acquire('a.png')
    atlas.acquire('b.png')
    await atlas.settled()
    atlas.flush()
    atlas.release('b.png')
    atlas.release('a.png')
    atlas.flush()
    expect(atlas.layer('b.png')).toBe(-1)
    expect(atlas.takeLoaded()).toEqual(new Set(['a.png']))
  })
})
