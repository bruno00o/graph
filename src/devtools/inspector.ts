import type { AnyIssue } from '../core/issues'
import type { ElementKeys, GraphTarget } from '../host/events'
import { type InspectedGraph, watchGraphs } from '../host/inspect'
import type { View } from '../types'

export const chartFrames = 120
const historyLength = 240
const listedIssues = 20
const recentRuns = 5
const rateWindow = 1000

export interface LayoutRunReport {
  readonly name: string
  readonly duration: number
  readonly completed: boolean
}

export interface StateReport {
  readonly name: string
  readonly nodes: number
  readonly edges: number
}

export interface LayoutReport {
  readonly name: string | null
  readonly running: boolean
  readonly progress: number
  readonly runs: readonly LayoutRunReport[]
}

export interface PerformanceReport {
  readonly frameRate: number
  readonly lastFrame: number
  readonly frames: readonly number[]
  readonly flush: number | null
  readonly apply: number | null
  readonly sync: number | null
  readonly render: number | null
  readonly labelTime: number | null
  readonly nodeLabels: number | null
  readonly edgeLabels: number | null
  readonly textureBytes: number | null
}

export interface GraphReport {
  readonly id: number
  readonly label: string
  readonly width: number
  readonly height: number
  readonly nodes: number
  readonly edges: number
  readonly pendingEdges: number
  readonly shapes: number
  readonly issueCount: number
  readonly issues: readonly AnyIssue[]
  readonly view: View
  readonly selection: ElementKeys
  readonly hovered: GraphTarget | null
  readonly focused: GraphTarget | null
  readonly states: readonly StateReport[]
  readonly layout: LayoutReport
  readonly performance: PerformanceReport
}

class GraphTrace {
  readonly id: number
  readonly starts: Float64Array = new Float64Array(historyLength)
  readonly totals: Float64Array = new Float64Array(historyLength)
  count = 0
  flush: number | null = null
  apply: number | null = null
  sync: number | null = null
  render: number | null = null
  runs: LayoutRunReport[] = []
  run: { readonly name: string; readonly start: number } | null = null

  constructor(id: number) {
    this.id = id
  }

  frame(start: number, total: number, sync: number, render: number): void {
    const at = this.count % historyLength
    this.starts[at] = start
    this.totals[at] = total
    this.count++
    this.sync = sync
    this.render = render
  }

  flushed(flush: number, apply: number): void {
    this.flush = flush
    this.apply = apply
  }

  started(name: string, now: number): void {
    this.run = { name, start: now }
  }

  ended(completed: boolean, now: number): void {
    const run = this.run
    if (!run) return
    this.run = null
    const report = { name: run.name, duration: now - run.start, completed }
    this.runs = [report, ...this.runs].slice(0, recentRuns)
  }

  recent(length: number): number[] {
    const count = Math.min(length, this.count)
    const values: number[] = []
    for (let i = this.count - count; i < this.count; i++)
      values.push(this.totals[i % historyLength] ?? 0)
    return values
  }

  frameRate(now: number): number {
    let frames = 0
    const count = Math.min(historyLength, this.count)
    for (let i = this.count - count; i < this.count; i++) {
      const start = this.starts[i % historyLength] ?? 0
      if (now - start < rateWindow) frames++
    }
    return frames
  }

  lastFrame(): number {
    return this.count === 0
      ? Number.NEGATIVE_INFINITY
      : (this.starts[(this.count - 1) % historyLength] ?? 0)
  }
}

const listeners = new Set<() => void>()
const traces = new WeakMap<InspectedGraph, GraphTrace>()
const watched = new Map<InspectedGraph, () => void>()
let stopWatching: (() => void) | null = null
let nextId = 1

function changed(): void {
  for (const listener of [...listeners]) listener()
}

function traceOf(graph: InspectedGraph): GraphTrace {
  let trace = traces.get(graph)
  if (!trace) {
    trace = new GraphTrace(nextId++)
    traces.set(graph, trace)
  }
  return trace
}

function attach(graph: InspectedGraph): void {
  if (watched.has(graph)) return
  const trace = traceOf(graph)
  graph.probe({
    flushed: (flush, apply) => {
      trace.flushed(flush, apply)
      changed()
    },
    framed: (start, total, sync, render) => {
      trace.frame(start, total, sync, render)
      changed()
    },
  })
  const instance = graph.graph
  const offStart = instance.on('layoutstart', ({ name }) => trace.started(name, performance.now()))
  const offEnd = instance.on('layoutend', ({ completed }) => {
    trace.ended(completed, performance.now())
    changed()
  })
  const offIssues = instance.on('issueschange', changed)
  const subscription = instance.store.subscribe(changed)
  watched.set(graph, () => {
    graph.probe(null)
    offStart()
    offEnd()
    offIssues()
    subscription.unsubscribe()
  })
  changed()
}

function detach(graph: InspectedGraph): void {
  const release = watched.get(graph)
  if (!release) return
  watched.delete(graph)
  release()
  changed()
}

export function inspectGraphs(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) stopWatching = watchGraphs({ added: attach, removed: detach })
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return
    stopWatching?.()
    stopWatching = null
    for (const graph of [...watched.keys()]) detach(graph)
  }
}

function report(graph: InspectedGraph, trace: GraphTrace, now: number): GraphReport {
  const instance = graph.graph
  const state = instance.store.state
  const inspection = graph.inspect()
  const renderer = inspection.renderer
  return {
    id: trace.id,
    label: instance.element.getAttribute('aria-label') ?? '',
    width: state.width,
    height: state.height,
    nodes: inspection.nodes,
    edges: inspection.edges,
    pendingEdges: inspection.pendingEdges,
    shapes: inspection.shapes,
    issueCount: inspection.issues.length,
    issues: inspection.issues.slice(0, listedIssues),
    view: state.view,
    selection: state.selection,
    hovered: state.hovered,
    focused: state.focused,
    states: Object.entries(state.states).map(([name, keys]) => ({
      name,
      nodes: keys.nodes.length,
      edges: keys.edges.length,
    })),
    layout: {
      name: inspection.layout ?? trace.run?.name ?? null,
      running: state.layout.running,
      progress: state.layout.progress,
      runs: trace.runs,
    },
    performance: {
      frameRate: trace.frameRate(now),
      lastFrame: trace.lastFrame(),
      frames: trace.recent(chartFrames),
      flush: trace.flush,
      apply: trace.apply,
      sync: trace.sync,
      render: trace.render,
      labelTime: renderer?.labelTime ?? null,
      nodeLabels: renderer?.nodeLabels ?? null,
      edgeLabels: renderer?.edgeLabels ?? null,
      textureBytes: renderer?.textureBytes ?? null,
    },
  }
}

export function graphReports(now: number = performance.now()): GraphReport[] {
  return [...watched.keys()].map((graph) => report(graph, traceOf(graph), now))
}
