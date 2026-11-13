import { labelAlways, maxStates } from '../core/state-buffers'

export const labelMin = 8
export const cullMargin = 400
export const forcedStates = 0b110
export const builtInRaise = 0b111

export interface MeasuredBlock {
  readonly width: number
  readonly height: number
}

export function labelLevel(mask: number, flags: Int8Array, others = 0): number {
  let bits = (mask | others) >>> 0
  while (bits !== 0) {
    const bit = 31 - Math.clz32(bits & -bits)
    bits &= bits - 1
    const flag = flags[((mask >>> bit) & 1) === 1 ? bit : maxStates + bit] ?? -1
    if (flag >= 0) return flag
  }
  return 1
}

export function levelBits(flags: Int8Array, from: number, bits = 0xffffffff): number {
  let found = 0
  for (let bit = 0; bit < maxStates; bit++) {
    if (((bits >>> bit) & 1) === 1 && flags[from + bit] === labelAlways) found |= 1 << bit
  }
  return found >>> 0
}

export function lifted(pixels: number, size: number, level: number, minimum: number): number {
  return level === labelAlways ? Math.max(pixels, Math.min(size, minimum)) : pixels
}

export class TextExtents {
  #sizes: Float32Array = new Float32Array(0)
  #generation = -1

  prepare(capacity: number, generation: number): void {
    if (generation !== this.#generation) {
      this.#generation = generation
      this.#sizes.fill(Number.NaN)
    }
    if (this.#sizes.length >= capacity * 2) return
    const sizes = new Float32Array(Math.max(128, capacity * 2)).fill(Number.NaN)
    sizes.set(this.#sizes)
    this.#sizes = sizes
  }

  has(index: number): boolean {
    return !Number.isNaN(this.#sizes[index * 2] ?? Number.NaN)
  }

  width(index: number): number {
    return this.#sizes[index * 2] ?? 0
  }

  height(index: number): number {
    return this.#sizes[index * 2 + 1] ?? 0
  }

  set(index: number, block: MeasuredBlock): void {
    if (index * 2 + 1 >= this.#sizes.length) return
    this.#sizes[index * 2] = block.width
    this.#sizes[index * 2 + 1] = block.height
  }

  forget(index: number): void {
    if (index * 2 < this.#sizes.length) this.#sizes[index * 2] = Number.NaN
  }

  reset(): void {
    this.#generation = -1
  }
}
