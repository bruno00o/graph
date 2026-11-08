import type { GraphIssue } from '../core/issues'
import type { GraphInstance } from './graph-instance'
import type { RendererStats } from './renderer'

export interface GraphProbe {
  flushed(flush: number, apply: number): void
  framed(start: number, total: number, sync: number, render: number): void
}

export interface GraphInspection {
  readonly nodes: number
  readonly edges: number
  readonly pendingEdges: number
  readonly issues: readonly GraphIssue[]
  readonly layout: string | null
  readonly renderer: RendererStats | null
}

export interface InspectedGraph {
  readonly graph: GraphInstance
  inspect(): GraphInspection
  probe(probe: GraphProbe | null): void
}

export interface GraphWatcher {
  added(graph: InspectedGraph): void
  removed(graph: InspectedGraph): void
}

const mounted = new Set<InspectedGraph>()
const watchers = new Set<GraphWatcher>()

export function registerGraph(graph: InspectedGraph): () => void {
  mounted.add(graph)
  for (const watcher of [...watchers]) watcher.added(graph)
  return () => {
    if (!mounted.delete(graph)) return
    for (const watcher of [...watchers]) watcher.removed(graph)
  }
}

export function watchGraphs(watcher: GraphWatcher): () => void {
  watchers.add(watcher)
  for (const graph of [...mounted]) watcher.added(graph)
  return () => {
    watchers.delete(watcher)
  }
}
