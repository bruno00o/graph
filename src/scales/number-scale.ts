import type { NumberScale, NumberScaleType } from '../types'
import type { Extent } from './extent'

export interface ResolvedNumberScale {
  readonly needsExtent: boolean
  readonly domain: Extent | null
  map(value: number, extent: Extent | null): number
}

const transforms: Record<NumberScaleType, (value: number) => number> = {
  linear: (value) => value,
  sqrt: (value) => Math.sign(value) * Math.sqrt(Math.abs(value)),
}

export function resolveNumberScale(
  options: NumberScale | undefined,
  fallback: { readonly type: NumberScaleType; readonly range: Extent },
): ResolvedNumberScale {
  if (typeof options === 'function') {
    return { needsExtent: false, domain: null, map: (value) => options(value) }
  }
  const transform = transforms[options?.type ?? fallback.type]
  const [r0, r1] = options?.range ?? fallback.range
  const low = Math.min(r0, r1)
  const high = Math.max(r0, r1)
  const domain = options?.domain ?? null
  return {
    needsExtent: domain === null,
    domain,
    map(value, extent) {
      const [d0, d1] = domain ?? extent ?? [value, value]
      if (domain === null && d0 === d1) return Math.min(high, Math.max(low, value))
      const t0 = transform(d0)
      const t1 = transform(d1)
      if (t0 === t1) return (r0 + r1) / 2
      const t = Math.min(1, Math.max(0, (transform(value) - t0) / (t1 - t0)))
      return r0 + t * (r1 - r0)
    },
  }
}
