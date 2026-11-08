import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchFonts } from './fonts'

function install(set: object): void {
  Object.defineProperty(document, 'fonts', { value: set, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts')
})

describe('watchFonts', () => {
  it('does nothing without the font loading API', () => {
    expect(watchFonts(() => {})).toBeNull()
  })

  it('reports the families of the faces that finished loading, and not the failed ones', async () => {
    const good = { family: '"Good"', status: 'loading' }
    const bad = { family: 'Bad', status: 'loading' }
    const set = Object.assign(new EventTarget(), {
      status: 'loaded',
      ready: Promise.resolve(),
      faces: [good, bad],
      [Symbol.iterator]() {
        return this.faces[Symbol.iterator]()
      },
    })
    install(set)
    const seen = vi.fn()
    const stop = watchFonts(seen)
    set.status = 'loading'
    set.dispatchEvent(new Event('loading'))
    good.status = 'loaded'
    bad.status = 'error'
    set.status = 'loaded'
    await set.ready
    await Promise.resolve()
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith(new Set(['good']))
    stop?.()
  })

  it('reports any family when the faces cannot be listed', async () => {
    const set = Object.assign(new EventTarget(), { status: 'loaded', ready: Promise.resolve() })
    install(set)
    const seen = vi.fn()
    const stop = watchFonts(seen)
    set.dispatchEvent(new Event('loading'))
    await set.ready
    await Promise.resolve()
    expect(seen).toHaveBeenCalledWith(null)
    stop?.()
  })

  it('reports nothing once stopped', async () => {
    const set = Object.assign(new EventTarget(), { status: 'loaded', ready: Promise.resolve() })
    install(set)
    const seen = vi.fn()
    const stop = watchFonts(seen)
    set.dispatchEvent(new Event('loading'))
    stop?.()
    await set.ready
    await Promise.resolve()
    expect(seen).not.toHaveBeenCalled()
  })
})
