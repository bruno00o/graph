import { categoricalRange, sequentialRange } from '../theme/tokens'
import type { ColorScale } from '../types'
import type { Extent } from './extent'

export interface ResolvedColorScale {
  readonly sequential: boolean
  readonly needsExtent: boolean
  map(value: unknown, extent: Extent | null): string | null
}

function interpolate(stops: readonly string[], t: number): string | null {
  const last = stops.length - 1
  if (last < 1) return stops[0] ?? null
  const position = t * last
  const segment = Math.min(Math.floor(position), last - 1)
  const percent = Math.round((position - segment) * 100)
  const from = stops[segment] ?? null
  const to = stops[segment + 1] ?? null
  if (percent === 0 || to === null) return from
  if (percent === 100) return to
  return `color-mix(in oklab, ${from}, ${to} ${percent}%)`
}

function categorical(domain: readonly unknown[], range: readonly string[]): ResolvedColorScale {
  const positions = new Map<unknown, number>()
  for (const value of domain) if (!positions.has(value)) positions.set(value, positions.size)
  let lastValue: unknown
  let lastColor: string | null = null
  return {
    sequential: false,
    needsExtent: false,
    map(value) {
      if (value === null || value === undefined || range.length === 0) return null
      if (value === lastValue) return lastColor
      let position = positions.get(value)
      if (position === undefined) {
        position = positions.size
        positions.set(value, position)
      }
      lastValue = value
      lastColor = range[position % range.length] ?? null
      return lastColor
    },
  }
}

function sequential(domain: Extent | null, range: readonly string[]): ResolvedColorScale {
  return {
    sequential: true,
    needsExtent: domain === null,
    map(value, extent) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      const [d0, d1] = domain ?? extent ?? [value, value]
      const t = d0 === d1 ? 0.5 : Math.min(1, Math.max(0, (value - d0) / (d1 - d0)))
      return interpolate(range, t)
    },
  }
}

export function resolveColorScale(options: ColorScale | undefined): ResolvedColorScale {
  if (typeof options === 'function') {
    return {
      sequential: false,
      needsExtent: false,
      map: (value) => (value === null || value === undefined ? null : options(value)),
    }
  }
  if (options?.type === 'sequential') {
    return sequential(options.domain ?? null, options.range ?? sequentialRange)
  }
  return categorical(options?.domain ?? [], options?.range ?? categoricalRange)
}
