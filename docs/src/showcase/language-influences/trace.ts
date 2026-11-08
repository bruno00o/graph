import type { GraphReach, Key } from '@bruno00o/graph'
import type { Depth, LanguageGraph } from './definition'

export interface Lineage {
  readonly before: GraphReach
  readonly after: GraphReach
}

export function lineageOf(graph: LanguageGraph, key: Key, depth: Depth): Lineage {
  const options = depth === 'all' ? {} : { maxCost: depth }
  return {
    before: graph.paths.reach(key, { ...options, direction: 'backward' }),
    after: graph.paths.reach(key, { ...options, direction: 'forward' }),
  }
}

export function liftToGroups(graph: LanguageGraph, keys: readonly Key[]): Key[] {
  const found = new Set<Key>(keys)
  for (const key of keys) {
    for (
      let parent = graph.groups.parent(key);
      parent !== undefined;
      parent = graph.groups.parent(parent)
    ) {
      found.add(parent)
    }
  }
  return [...found]
}
