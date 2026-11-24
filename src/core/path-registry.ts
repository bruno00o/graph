import type { GraphModel } from './graph-model'
import type { PathGroups } from './paths'

export interface PathShown {
  node(index: number): boolean
  edge(index: number): boolean
}

export interface PathSource {
  readonly model: GraphModel
  prepare(): void
  groups(): PathGroups | null
  shown(): PathShown | null
  stamp(): number
  destroyed(): boolean
}

const registry = new WeakMap<object, PathSource>()

export function registerPathSource(target: object, source: PathSource): void {
  registry.set(target, source)
}

export function pathSourceOf(target: object): PathSource | undefined {
  return registry.get(target)
}
