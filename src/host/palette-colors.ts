import type { Scene } from '../core/scene'
import type { ColorSource } from './environment'

export class PaletteColors {
  colors: Uint8Array = new Uint8Array(256 * 4)
  version = 0
  stamp = 0
  count = 0
  readonly #scene: Scene
  readonly #source: ColorSource
  readonly #resolved: (colors: Uint8Array, count: number) => void

  constructor(
    scene: Scene,
    source: ColorSource,
    resolved: (colors: Uint8Array, count: number) => void,
  ) {
    this.#scene = scene
    this.#source = source
    this.#resolved = resolved
  }

  resolve(all: boolean): void {
    const palette = this.#scene.palette
    const source = this.#source
    const colors = palette.colors
    if (colors.length * 4 > this.colors.length) {
      const next = new Uint8Array(Math.max(colors.length * 4, this.colors.length * 2))
      next.set(this.colors)
      this.colors = next
    }
    const target = this.colors
    if (all) source.palette(colors, target)
    else {
      palette.changed(this.version, (id, color) => {
        target.set(source.color(color), id * 4)
      })
    }
    this.version = palette.version
    this.count = colors.length
    this.stamp++
    this.#resolved(target, this.count)
  }
}
