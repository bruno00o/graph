import type { Renderer } from './renderer'

const pollDelay = 16

export function progress(now: number, start: number, duration: number, cost: number): number {
  if (now + cost >= start + duration) return 1
  return (now - start) / duration
}

export class FrameCost {
  #last = 0
  #previous = 0
  #start = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  readonly #renderer: () => Renderer | null

  constructor(renderer: () => Renderer | null) {
    this.#renderer = renderer
  }

  get value(): number {
    return Math.min(this.#last, this.#previous)
  }

  drawn(start: number): void {
    if (!this.#renderer()?.busy) return
    if (this.#timer !== undefined) this.#record(start - this.#start)
    this.#start = start
    clearTimeout(this.#timer)
    this.#timer = setTimeout(this.#poll, 0)
  }

  stop(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #record(cost: number): void {
    this.#previous = this.#last
    this.#last = Math.max(0, cost)
  }

  readonly #poll = (): void => {
    this.#timer = undefined
    const renderer = this.#renderer()
    if (!renderer?.busy || document.visibilityState === 'hidden') return
    if (renderer.busy()) {
      this.#timer = setTimeout(this.#poll, pollDelay)
      return
    }
    this.#record(performance.now() - this.#start)
  }
}
