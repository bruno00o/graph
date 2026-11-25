import type { AnyIssue } from '../core/issues'
import type { PixelRatioOption } from '../types'
import type { GraphCore } from './graph-instance'
import { report } from './isolate'
import type { RendererStats } from './renderer'

export interface GraphProbe {
  flushed(flush: number, apply: number): void
  framed(start: number, total: number, sync: number, render: number): void
}

export interface GraphInspection {
  readonly nodes: number
  readonly edges: number
  readonly pendingEdges: number
  readonly shapes: number
  readonly issues: readonly AnyIssue[]
  readonly layout: string | null
  readonly renderer: RendererStats | null
  readonly contextLost: boolean
  readonly software: boolean | null
  readonly pixelRatio: number
  readonly ratioOption: PixelRatioOption
}

export interface InspectedGraph {
  readonly graph: GraphCore
  label(): string
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
  for (const watcher of [...watchers]) tell(() => watcher.added(graph))
  return () => {
    if (!mounted.delete(graph)) return
    for (const watcher of [...watchers]) tell(() => watcher.removed(graph))
  }
}

export function watchGraphs(watcher: GraphWatcher): () => void {
  watchers.add(watcher)
  for (const graph of [...mounted]) tell(() => watcher.added(graph))
  return () => {
    watchers.delete(watcher)
  }
}

function tell(call: () => void): void {
  try {
    call()
  } catch (error) {
    report(error)
  }
}
