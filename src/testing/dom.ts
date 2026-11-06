import { vi } from 'vitest'
import type { Renderer } from '../host/renderer'

export interface FakeDom {
  flushFrames(): void
  pendingFrames(): number
  restore(): void
}

export function fakeRenderer(): Renderer {
  return {
    sync: () => {},
    setPalette: () => {},
    setTheme: () => {},
    render: () => -1,
    destroy: () => {},
  }
}

export function installDom(width = 800, height = 600): FakeDom {
  let frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly #callback: ResizeObserverCallback
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback
      }
      observe() {
        this.#callback(
          [{ contentRect: { width, height } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        )
      }
      unobserve() {}
      disconnect() {}
    },
  )
  return {
    flushFrames() {
      for (let round = 0; round < 5 && frames.length > 0; round++) {
        const pending = frames
        frames = []
        for (const callback of pending) callback(performance.now() + 10_000)
      }
    },
    pendingFrames() {
      return frames.length
    },
    restore() {
      vi.unstubAllGlobals()
      document.body.innerHTML = ''
    },
  }
}
