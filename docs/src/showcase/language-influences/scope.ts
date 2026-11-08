import type { Influence, Language, Network } from './data'
import type { Depth } from './definition'

export interface Scope {
  readonly languages: readonly Language[]
  readonly influences: readonly Influence[]
}

function reachOf(
  start: string,
  next: ReadonlyMap<string, readonly Language[]>,
  depth: Depth,
): Set<string> {
  const limit = depth === 'all' ? Number.POSITIVE_INFINITY : depth
  const seen = new Set([start])
  let front = [start]
  for (let step = 0; step < limit && front.length > 0; step++) {
    const found: string[] = []
    for (const key of front) {
      for (const language of next.get(key) ?? []) {
        if (seen.has(language.id)) continue
        seen.add(language.id)
        found.push(language.id)
      }
    }
    front = found
  }
  return seen
}

export function scopeOf(network: Network, key: string, depth: Depth): Scope | null {
  if (!network.byId.has(key)) return null
  const before = reachOf(key, network.influencersOf, depth)
  const after = reachOf(key, network.influencedOf, depth)
  const inside = (side: ReadonlySet<string>, influence: Influence) =>
    side.has(influence.from) && side.has(influence.to)
  return {
    languages: network.languages.filter(
      (language) => before.has(language.id) || after.has(language.id),
    ),
    influences: network.influences.filter(
      (influence) => inside(before, influence) || inside(after, influence),
    ),
  }
}
