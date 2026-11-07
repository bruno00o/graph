const absent = 0xffff
const fewestLayers = 32
const mostLayers = 255
const residual = Math.log(1 / 4096)

export function layerCap(alpha: number): number {
  if (!(alpha > 0)) return 0
  if (alpha >= 1) return fewestLayers
  const layers = Math.ceil(residual / Math.log(1 - alpha))
  return layers > mostLayers ? 0 : Math.max(fewestLayers, layers)
}

export class EdgeCover {
  #levels: Uint16Array = new Uint16Array(0)
  readonly #counts: Uint32Array = new Uint32Array(256)
  #palette: Uint8Array = new Uint8Array(0)
  #paletteCount = 0

  alphaOf(color: number): number {
    return color < this.#paletteCount ? (this.#palette[color * 4 + 3] ?? 255) / 255 : 1
  }

  setPalette(colors: Uint8Array, count: number): void {
    this.#palette = colors
    this.#paletteCount = count
  }

  set(index: number, alive: boolean, opacity: number, color: number, other: number = color): void {
    if (index >= this.#levels.length) {
      const levels = new Uint16Array(Math.max(64, this.#levels.length * 2, index + 1)).fill(absent)
      levels.set(this.#levels)
      this.#levels = levels
    }
    const before = this.#levels[index] ?? absent
    const level = alive
      ? Math.max(
          0,
          Math.min(
            255,
            Math.floor(opacity * Math.min(this.alphaOf(color), this.alphaOf(other)) * 255),
          ),
        )
      : absent
    if (before === level) return
    if (before !== absent) this.#counts[before] = (this.#counts[before] ?? 1) - 1
    if (level !== absent) this.#counts[level] = (this.#counts[level] ?? 0) + 1
    this.#levels[index] = level
  }

  lowest(): number {
    for (let level = 0; level < 256; level++) if ((this.#counts[level] ?? 0) > 0) return level / 255
    return 1
  }
}
