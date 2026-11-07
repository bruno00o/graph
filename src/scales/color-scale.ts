import { categoricalRange, sequentialRange } from '../theme/tokens'
import type { ColorScale } from '../types'
import type { Extent } from './extent'

export type ColorScaleKind = 'categorical' | 'sequential' | 'function'

export interface ResolvedColorScale {
  readonly kind: ColorScaleKind
  readonly needsExtent: boolean
  readonly domain: Extent | null
  readonly range: readonly string[]
  readonly listed: readonly unknown[]
  size(): number
  categories(): Iterable<unknown>
  map(value: unknown, extent: Extent | null): string | null
  forget(value: unknown): void
}

const none: readonly never[] = []

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
  const listed = new Set(domain)
  const free: number[] = []
  let sorted = true
  let next = positions.size
  let lastValue: unknown
  let lastColor: string | null = null
  return {
    kind: 'categorical',
    needsExtent: false,
    domain: null,
    range,
    listed: domain,
    size: () => positions.size,
    categories: () => positions.keys(),
    map(value) {
      if (value === null || value === undefined || range.length === 0) return null
      if (value === lastValue) return lastColor
      let position = positions.get(value)
      if (position === undefined) {
        if (!sorted) {
          free.sort((a, b) => b - a)
          sorted = true
        }
        position = free.pop() ?? next++
        positions.set(value, position)
      }
      lastValue = value
      lastColor = range[position % range.length] ?? null
      return lastColor
    },
    forget(value) {
      const position = positions.get(value)
      if (position === undefined || listed.has(value)) return
      positions.delete(value)
      free.push(position)
      sorted = false
      lastValue = undefined
      lastColor = null
    },
  }
}

function sequential(domain: Extent | null, range: readonly string[]): ResolvedColorScale {
  return {
    kind: 'sequential',
    needsExtent: domain === null,
    domain,
    range,
    listed: none,
    size: () => 0,
    categories: () => none,
    forget() {},
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
      kind: 'function',
      needsExtent: false,
      domain: null,
      range: none,
      listed: none,
      size: () => 0,
      categories: () => none,
      forget() {},
      map(value) {
        if (value === null || value === undefined) return null
        const color: unknown = options(value)
        return typeof color === 'string' && color !== '' ? color : null
      },
    }
  }
  if (options?.type === 'sequential') {
    return sequential(options.domain ?? null, options.range ?? sequentialRange)
  }
  return categorical(options?.domain ?? [], options?.range ?? categoricalRange)
}
