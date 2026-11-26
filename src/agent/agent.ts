import type { GraphTarget } from '../host/events'
import type { GraphCore, GraphState } from '../host/graph-instance'
import { internalsOf } from '../host/internals'
import type { Key } from '../types'
import { runAct } from './act'
import { readKey, readKeys, rounded, timeOut } from './keys'
import { query, TextCache } from './query'
import { degrees, type ElementReader, edgeElement, Frame, nodeElement } from './read'
import { subscriber } from './subscribe'
import type {
  AgentActRequest,
  AgentActResult,
  AgentChange,
  AgentElement,
  AgentIssue,
  AgentKeys,
  AgentMore,
  AgentQueryOptions,
  AgentQueryResult,
  AgentSnapshot,
  AgentSnapshotOptions,
  AgentStateCount,
  AgentTarget,
  GraphAgent,
  GraphAgentOptions,
} from './types'

function checkLimit(limit: number | undefined, fallback: number, name: string): number {
  if (limit === undefined) return fallback
  if (!Number.isFinite(limit) || limit < 1) {
    throw new RangeError(`${name}: limit must be a number, 1 or more`)
  }
  return Math.floor(limit)
}

export function keysOut(keys: {
  readonly nodes: readonly Key[]
  readonly edges: readonly Key[]
  readonly shapes?: readonly Key[] | undefined
}): AgentKeys {
  const out = { nodes: readKeys(keys.nodes), edges: readKeys(keys.edges) }
  return keys.shapes && keys.shapes.length > 0 ? { ...out, shapes: readKeys(keys.shapes) } : out
}

export function stateCounts(
  states: GraphState['states'],
  only?: ReadonlySet<string>,
): Record<string, AgentStateCount> {
  const out: Record<string, AgentStateCount> = {}
  for (const [name, keys] of Object.entries(states)) {
    if (only && !only.has(name)) continue
    const shapes = keys.shapes?.length ?? 0
    if (!only && keys.nodes.length + keys.edges.length + shapes === 0) continue
    out[name] = {
      nodes: keys.nodes.length,
      edges: keys.edges.length,
      ...(shapes > 0 ? { shapes } : {}),
    }
  }
  return out
}

function targetOut(target: GraphTarget | null): AgentTarget | null {
  return target ? { kind: target.kind, key: readKey(target.key) } : null
}

function issueText(datum: unknown): string {
  try {
    const text = JSON.stringify(datum) ?? String(datum)
    return text.length > 200 ? `${text.slice(0, 199)}…` : text
  } catch {
    return String(datum)
  }
}

interface IssueFields {
  readonly type?: unknown
  readonly kind?: unknown
  readonly key?: unknown
  readonly parent?: unknown
  readonly carrier?: unknown
  readonly reason?: unknown
  readonly datum?: unknown
}

function issuesOut(graph: GraphCore): AgentIssue[] {
  const out: AgentIssue[] = []
  for (const issue of graph.issues()) {
    if (out.length >= 20) break
    const entry: IssueFields = issue
    out.push({
      type: String(entry.type),
      kind: String(entry.kind),
      ...('key' in entry ? { key: readKey(entry.key) } : {}),
      ...('parent' in entry ? { parent: readKey(entry.parent) } : {}),
      ...('carrier' in entry ? { carrier: readKey(entry.carrier) } : {}),
      ...('reason' in entry ? { reason: String(entry.reason) } : {}),
      ...('datum' in entry ? { datum: issueText(entry.datum) } : {}),
    })
  }
  return out
}

class TopList {
  readonly #scores: number[] = []
  readonly #items: number[] = []
  readonly #size: number

  constructor(size: number) {
    this.#size = size
  }

  get length(): number {
    return this.#items.length
  }

  #less(a: number, b: number): boolean {
    const scores = this.#scores
    const items = this.#items
    const sa = scores[a] ?? 0
    const sb = scores[b] ?? 0
    return sa < sb || (sa === sb && (items[a] ?? 0) > (items[b] ?? 0))
  }

  #swap(a: number, b: number): void {
    const scores = this.#scores
    const items = this.#items
    const score = scores[a] ?? 0
    scores[a] = scores[b] ?? 0
    scores[b] = score
    const item = items[a] ?? 0
    items[a] = items[b] ?? 0
    items[b] = item
  }

  push(item: number, score: number): void {
    const scores = this.#scores
    const items = this.#items
    if (items.length < this.#size) {
      scores.push(score)
      items.push(item)
      let at = items.length - 1
      while (at > 0) {
        const up = (at - 1) >> 1
        if (!this.#less(at, up)) break
        this.#swap(at, up)
        at = up
      }
      return
    }
    const low = scores[0] ?? 0
    if (score < low || (score === low && item > (items[0] ?? 0))) return
    scores[0] = score
    items[0] = item
    let at = 0
    for (;;) {
      const left = at * 2 + 1
      const right = left + 1
      let least = at
      if (left < items.length && this.#less(left, least)) least = left
      if (right < items.length && this.#less(right, least)) least = right
      if (least === at) break
      this.#swap(at, least)
      at = least
    }
  }

  sorted(): number[] {
    const order = this.#items.map((_, at) => at)
    order.sort((a, b) => {
      const sa = this.#scores[a] ?? 0
      const sb = this.#scores[b] ?? 0
      return sb - sa || (this.#items[a] ?? 0) - (this.#items[b] ?? 0)
    })
    return order.map((at) => this.#items[at] ?? 0)
  }
}

const edgeFlag = 2 ** 31
const raisedNode = 4e9
const raisedEdge = 3e9
const plainNode = 2e9

/**
 * Makes the bridge between a graph and an agent: it reads what the graph draws, finds elements
 * and acts on them through the public API of the graph, for a coding agent in development or an
 * assistant in an app. It works on a mounted graph as on one made by `createGraph`.
 * @experimental
 */
export function createGraphAgent(graph: GraphCore, options: GraphAgentOptions = {}): GraphAgent {
  const internals = internalsOf(graph, 'createGraphAgent')
  const limit = checkLimit(options.limit, 50, 'createGraphAgent')
  const describe = options.describe ?? null
  const changes = subscriber(graph)
  const texts = new TextCache()

  const reader = (): ElementReader => ({
    graph,
    internals,
    describe,
    folded: new Set(graph.store.state.folded),
  })

  interface Listed {
    readonly label: string | null
    readonly elements: (AgentElement | AgentMore)[]
    readonly onScreen: { readonly nodes: number; readonly edges: number }
    readonly labelsDrawn: { readonly nodes: number; readonly edges: number } | null
  }

  function listed(most: number, withLabels: boolean): Listed {
    const frame = new Frame(graph, internals)
    const { edges } = frame.shot.scene
    const states = frame.shot.states
    const raisedNodes = states.raised('nodes')
    const raisedEdges = states.raised('edges')
    const top = new TopList(most)
    for (const index of frame.nodes) {
      const raised = ((states.nodeMask[index] ?? 0) & raisedNodes) !== 0
      top.push(index, (raised ? raisedNode : plainNode) + frame.diameter(index))
    }
    for (const index of frame.edges) {
      const raised = ((states.edgeMask[index] ?? 0) & raisedEdges) !== 0
      top.push(edgeFlag + index, (raised ? raisedEdge : 0) + (edges.width[index] ?? 0))
    }
    const labels = withLabels ? frame.labels() : null
    const picked = top.sorted()
    const degree = degrees(
      frame,
      picked.filter((item) => item < edgeFlag),
    )
    const read = reader()
    const elements: (AgentElement | AgentMore)[] = picked.map((item) =>
      item < edgeFlag
        ? nodeElement(read, frame, item, degree.get(item) ?? 0, labels)
        : edgeElement(read, frame, item - edgeFlag, labels),
    )
    const onScreen = frame.nodes.length + frame.edges.length
    if (onScreen > elements.length) elements.push({ more: onScreen - elements.length })
    return {
      label: frame.shot.title,
      elements,
      onScreen: { nodes: frame.nodes.length, edges: frame.edges.length },
      labelsDrawn: labels ? { nodes: labels.nodes.size, edges: labels.edges.size } : null,
    }
  }

  const nothing: Listed = {
    label: null,
    elements: [],
    onScreen: { nodes: 0, edges: 0 },
    labelsDrawn: null,
  }

  function snapshot(request: AgentSnapshotOptions = {}): AgentSnapshot {
    const most = checkLimit(request.limit, limit, 'snapshot')
    const counts = graph.count()
    const seen = graph.destroyed ? nothing : listed(most, request.labels !== false)
    const state = graph.store.state
    const layout = internals.definition().layout
    const time = state.time
    return {
      graph: {
        label: seen.label,
        surface: state.surface,
        size: [state.width, state.height],
        drawable: state.drawable,
        suspended: state.suspended,
      },
      settled: graph.destroyed || internals.idle(),
      counts,
      view: {
        zoom: rounded(state.view.zoom, 4),
        center: [rounded(state.view.x, 2), rounded(state.view.y, 2)],
        onScreen: seen.onScreen,
        labelsDrawn: seen.labelsDrawn,
      },
      selection: keysOut(state.selection),
      focus: state.focused ? readKey(state.focused.key) : null,
      hover: targetOut(state.hovered),
      states: stateCounts(state.states),
      layers: { names: [...graph.layers.names()], hidden: [...state.hiddenLayers] },
      time: time ? { start: timeOut(time.start), end: timeOut(time.end) } : null,
      folded: readKeys(state.folded),
      layout: {
        name: layout?.name ?? null,
        running: state.layout.running,
        progress: rounded(state.layout.progress, 2),
      },
      data: state.data,
      issues: issuesOut(graph),
      elements: seen.elements,
    }
  }

  function find(request: AgentQueryOptions = {}): AgentQueryResult {
    if (graph.destroyed) return { total: 0, from: request.from ?? 0, items: [], truncated: false }
    const frame = new Frame(graph, internals)
    return query(graph, internals, reader(), frame, texts, request)
  }

  function act(request: AgentActRequest): Promise<AgentActResult> {
    return runAct(graph, internals, changes, request)
  }

  function subscribe(listener: (change: AgentChange) => void): () => void {
    return changes.add(listener)
  }

  function destroy(): void {
    changes.clear()
  }

  return { snapshot, query: find, act, subscribe, destroy }
}
