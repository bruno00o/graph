import type { HostSurface } from './graph-instance'

export class FrameScheduler {
  needsFlush = false
  #frameRequest = 0
  #laterRequest: ReturnType<typeof setTimeout> | undefined
  #quiet = false
  readonly #frame: (now: number) => void
  readonly #surface: HostSurface | null
  readonly #destroyed: () => boolean

  constructor(frame: (now: number) => void, surface: HostSurface | null, destroyed: () => boolean) {
    this.#frame = frame
    this.#surface = surface
    this.#destroyed = destroyed
  }

  get due(): boolean {
    return this.#frameRequest !== 0
  }

  request(flush = false): void {
    if (flush) this.needsFlush = true
    if (this.#frameRequest !== 0 || this.#destroyed() || (this.#quiet && !flush)) return
    if (!this.#surface) {
      this.#frameRequest = requestAnimationFrame(this.#frame)
      return
    }
    this.#frameRequest = -1
    this.#surface.schedule()
  }

  hush(run: () => void): void {
    const was = this.#quiet
    this.#quiet = true
    try {
      run()
    } finally {
      this.#quiet = was
    }
  }

  later(delay: number): void {
    if (this.#laterRequest !== undefined || this.#destroyed()) return
    this.#laterRequest = setTimeout(() => {
      this.#laterRequest = undefined
      this.request()
    }, delay)
  }

  started(): void {
    this.#frameRequest = 0
  }

  cancelFrame(): void {
    if (this.#frameRequest > 0) cancelAnimationFrame(this.#frameRequest)
  }

  takeFrame(): void {
    this.cancelFrame()
    this.#frameRequest = 0
  }

  cancelLater(): void {
    clearTimeout(this.#laterRequest)
  }
}
