import type { WidthScale } from '../types'

export const defaultMinWidth = 0.75
export const widthSlots = 128
export const screenWidth = -1
export const screenSlot: number = widthSlots

export interface WidthScaleOptions {
  readonly widthScale?: WidthScale | undefined
  readonly minWidth?: number | undefined
}

export function drawnWidth(width: number, least: number, zoom: number): number {
  return least < 0 ? width : Math.max(width * Math.min(zoom, 1), Math.min(width, least))
}

export function checkWidthScale(caller: string, options: WidthScaleOptions): void {
  const scale: unknown = options.widthScale
  if (scale !== undefined && scale !== 'screen' && scale !== 'shrink') {
    throw new TypeError(`${caller}: widthScale must be 'screen' or 'shrink'`)
  }
  const least: unknown = options.minWidth
  if (least !== undefined && !(typeof least === 'number' && least >= 0 && least < Infinity)) {
    throw new RangeError(`${caller}: minWidth must be a finite number, 0 or more`)
  }
}

export function leastWidth(options: WidthScaleOptions): number {
  return options.widthScale === 'shrink' ? (options.minWidth ?? defaultMinWidth) : screenWidth
}

export class WidthFloors {
  readonly least: Float32Array = new Float32Array(widthSlots).fill(screenWidth)
  version = 0
  shrinks = false

  set(list: readonly number[]): boolean {
    let changed = false
    for (let slot = 0; slot < widthSlots; slot++) {
      const least = Math.fround(list[slot] ?? screenWidth)
      if (this.least[slot] === least) continue
      this.least[slot] = least
      changed = true
    }
    if (!changed) return false
    this.shrinks = this.least.some((least) => least >= 0)
    this.version++
    return true
  }

  at(slot: number): number {
    return slot < widthSlots ? (this.least[slot] ?? screenWidth) : screenWidth
  }

  drawn(width: number, slot: number, zoom: number): number {
    return this.shrinks ? drawnWidth(width, this.at(slot), zoom) : width
  }
}
