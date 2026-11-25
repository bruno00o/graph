import type { GraphDataStatus } from '../host/events'
import type { GraphCount } from '../host/graph-instance'
import type { Key, PathDirection } from '../types'

/**
 * Kind of an element the bridge reads: `'node'`, `'edge'` or `'shape'`.
 * @experimental
 */
export type AgentElementKind = 'node' | 'edge' | 'shape'

/**
 * Key of an element as the bridge writes and reads it: the key of the data, or for a group node
 * made by `groups()`, the parts of its key.
 * @experimental
 */
export type AgentKey = Key | AgentGroupKey

/**
 * Key of a group node made by `groups()`, as the bridge writes it and reads it back.
 * @experimental
 */
export interface AgentGroupKey {
  /** The parts of the key. */
  readonly group: AgentGroup
}

/**
 * Parts of the key of a group node made by `groups()`, the arguments of `groups.keyOf`.
 * @experimental
 */
export interface AgentGroup {
  /** `name` of the mark, or the field of its `by` option when it has no name. */
  readonly name: string
  /** The value the members share. */
  readonly value: AgentKey
  /** Key of the parent group, for a group nested in a group of the data. */
  readonly parent?: AgentKey | undefined
}

/**
 * Options of `createGraphAgent`.
 * @experimental
 */
export interface GraphAgentOptions {
  /**
   * What the bridge tells about an element besides its key, label, look and states: a few fields
   * of its item, a summary. Its result is written in the `data` of the element, `null` or
   * `undefined` writes nothing. Defaults to nothing, so that items stay out of what an agent
   * reads.
   */
  readonly describe?:
    | ((
        datum: unknown,
        key: Key,
        kind: AgentElementKind,
      ) => Readonly<Record<string, unknown>> | null | undefined)
    | undefined
  /**
   * Most elements a snapshot lists, the ones on screen with the highest priority. A number, 1 or
   * more.
   * @default 50
   */
  readonly limit?: number | undefined
}

/**
 * Options of `agent.snapshot`.
 * @experimental
 */
export interface AgentSnapshotOptions {
  /** Most elements to list. Defaults to the `limit` of `createGraphAgent`. */
  readonly limit?: number | undefined
  /**
   * Runs the label selection of the view to tell which labels are drawn. `false` saves its cost
   * on a large view and leaves `labelShown` out.
   * @default true
   */
  readonly labels?: boolean | undefined
}

/**
 * What a graph draws now, as JSON for an agent.
 * @experimental
 */
export interface AgentSnapshot {
  /** The graph and where it draws. */
  readonly graph: AgentGraphInfo
  /** `true` when nothing is left to do: no data change, layout, animation or deferred work. */
  readonly settled: boolean
  /** Elements of the data and elements drawn, as `graph.count()` gives them. */
  readonly counts: GraphCount
  /** The view and what it shows. */
  readonly view: AgentView
  /** Selected elements, at most 50 of each kind. */
  readonly selection: AgentKeys
  /** Node with the keyboard focus, or `null`. */
  readonly focus: AgentKey | null
  /** Element under the pointer, or `null`. */
  readonly hover: AgentTarget | null
  /** Members of the free states that have some, by state name. */
  readonly states: Readonly<Record<string, AgentStateCount>>
  /** Layers and the hidden ones. */
  readonly layers: AgentLayers
  /** The time window, or `null` when every element shows. */
  readonly time: AgentTime | null
  /** Folded groups, at most 50. */
  readonly folded: readonly AgentKey[]
  /** The layout and its current run. */
  readonly layout: AgentLayout
  /** Loading of the live sources. */
  readonly data: GraphDataStatus
  /** Problems in the data, at most 20. */
  readonly issues: readonly AgentIssue[]
  /**
   * Elements on screen, raised ones first (selected, focused, hovered, in a state with `raise`),
   * then nodes by drawn size, then edges by drawn width, up to `limit`. A last `{ more }` counts
   * the elements on screen left out.
   */
  readonly elements: readonly (AgentElement | AgentMore)[]
}

/**
 * The graph a snapshot reads and where it draws.
 * @experimental
 */
export interface AgentGraphInfo {
  /** Accessible name of the graph, or `null`. */
  readonly label: string | null
  /** Name of the surface: `'canvas'`, `'map'`, or `'none'` for a graph made by `createGraph`. */
  readonly surface: string
  /** Width and height, in CSS pixels. */
  readonly size: readonly [number, number]
  /** `false` when the graph cannot draw where it is. */
  readonly drawable: boolean
  /** `true` while the graph is suspended. */
  readonly suspended: boolean
}

/**
 * The view of a snapshot and what it shows.
 * @experimental
 */
export interface AgentView {
  /** Zoom: screen pixels per world unit. */
  readonly zoom: number
  /** World point at the center of the graph. */
  readonly center: readonly [number, number]
  /** Nodes and edges drawn inside the graph. */
  readonly onScreen: AgentCountPair
  /** Labels the label selection draws, or `null` when `labels` is `false`. */
  readonly labelsDrawn: AgentCountPair | null
}

/**
 * A number of nodes and a number of edges.
 * @experimental
 */
export interface AgentCountPair {
  /** Number of nodes. */
  readonly nodes: number
  /** Number of edges. */
  readonly edges: number
}

/**
 * Keys of nodes, edges and shapes.
 * @experimental
 */
export interface AgentKeys {
  /** Keys of the nodes. */
  readonly nodes: readonly AgentKey[]
  /** Keys of the edges. */
  readonly edges: readonly AgentKey[]
  /** Keys of the shapes, absent without any. */
  readonly shapes?: readonly AgentKey[] | undefined
}

/**
 * An element by its kind and key.
 * @experimental
 */
export interface AgentTarget {
  /** Kind of the element. */
  readonly kind: AgentElementKind
  /** Key of the element. */
  readonly key: AgentKey
}

/**
 * Members of a state.
 * @experimental
 */
export interface AgentStateCount {
  /** Number of member nodes. */
  readonly nodes: number
  /** Number of member edges. */
  readonly edges: number
  /** Number of member shapes, absent without any. */
  readonly shapes?: number | undefined
}

/**
 * Layers of a snapshot.
 * @experimental
 */
export interface AgentLayers {
  /** Names of the layers. */
  readonly names: readonly string[]
  /** Names of the hidden layers. */
  readonly hidden: readonly string[]
}

/**
 * A time window, each end an ISO 8601 date for a time after 1973, the number of milliseconds
 * otherwise, or `null` for an open end.
 * @experimental
 */
export interface AgentTime {
  /** First moment of the window, or `null`. */
  readonly start: string | number | null
  /** First moment after the window, or `null`. */
  readonly end: string | number | null
}

/**
 * The layout of a snapshot.
 * @experimental
 */
export interface AgentLayout {
  /** Name of the layout of the definition, or `null` without one. */
  readonly name: string | null
  /** `true` while a run is in progress. */
  readonly running: boolean
  /** Progress of the run, from 0 to 1. */
  readonly progress: number
}

/**
 * A problem in the data, as `graph.issues()` gives it, with the item of a missing key written as
 * a short text.
 * @experimental
 */
export interface AgentIssue {
  /**
   * Type of the problem: `'missing-key'`, `'duplicate-key'`, `'invalid-shape'`,
   * `'missing-parent'`, `'parent-cycle'` or `'missing-carrier'`.
   */
  readonly type: string
  /** Kind of the mark: `'nodes'`, `'edges'` or `'shapes'`. */
  readonly kind: string
  /** Key of the element, when it has one. */
  readonly key?: AgentKey | undefined
  /** The parent the node names, for `'missing-parent'` and `'parent-cycle'`. */
  readonly parent?: AgentKey | undefined
  /** The carrier the edge names, for `'missing-carrier'`. */
  readonly carrier?: AgentKey | undefined
  /** Why the shape is invalid, for `'invalid-shape'`. */
  readonly reason?: string | undefined
  /** The item without a key, as JSON cut to 200 characters, for `'missing-key'`. */
  readonly datum?: string | undefined
}

/**
 * Why a label is not drawn: `'state'` (a state sets `label: false`), `'too-small'` (its size on
 * screen is under the minimum), `'node-too-small'` (the node is under `minScreenSize`),
 * `'off-screen'`, `'overlap'` (an earlier label holds the place), `'edge-too-short'` (the label
 * is longer than the edge) or `'limit'` (the selection already drew its most labels).
 * @experimental
 */
export type AgentLabelHidden =
  | 'state'
  | 'too-small'
  | 'node-too-small'
  | 'off-screen'
  | 'overlap'
  | 'edge-too-short'
  | 'limit'

/**
 * An element a snapshot or a query lists.
 * @experimental
 */
export type AgentElement = AgentNode | AgentEdge | AgentShape

/**
 * A node as the bridge reads it.
 * @experimental
 */
export interface AgentNode {
  /** Always `'node'`. */
  readonly kind: 'node'
  /** Key of the node. */
  readonly key: AgentKey
  /** Label of the node, absent without one. */
  readonly label?: string | undefined
  /** Whether the label selection draws the label now, absent without a label or a selection. */
  readonly labelShown?: boolean | undefined
  /** Text drawn, when it differs from `label`: cut by `maxWidth`, or with a second line. */
  readonly labelDrawn?: string | undefined
  /** Why the label is not drawn, when it is known. */
  readonly labelHidden?: AgentLabelHidden | undefined
  /** Center on screen, in CSS pixels from the top left corner, absent off screen. */
  readonly screen?: readonly [number, number] | undefined
  /** Diameter drawn, in CSS pixels. */
  readonly size: number
  /** Colors and opacity drawn. */
  readonly look: AgentNodeLook
  /** States the node is a member of, built-in ones included. */
  readonly states: readonly string[]
  /** Key of the group that holds the node, absent at the top. */
  readonly group?: AgentKey | undefined
  /** `true` for a group drawn as a box around its members. */
  readonly container?: true | undefined
  /** `true` for a folded group. */
  readonly folded?: true | undefined
  /** Edges drawn at the node: an edge drawn for several merged edges counts once. */
  readonly degree: number
  /** `false` when the node is outside the graph on screen; absent otherwise. */
  readonly onScreen?: false | undefined
  /** `false` when the node is not drawn at all; absent otherwise. */
  readonly shown?: false | undefined
  /** What `describe` tells about the node. */
  readonly data?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Colors and opacity drawn for a node, states applied.
 * @experimental
 */
export interface AgentNodeLook {
  /** Fill color, as hex, or `null` for none. */
  readonly fill: string | null
  /** Stroke color, as hex, or `null` for none. */
  readonly stroke: string | null
  /** Opacity, from 0 to 1. */
  readonly opacity: number
  /** `true` when a state lowers the opacity, as the `others` of a state does. */
  readonly dimmed?: true | undefined
}

/**
 * An edge as the bridge reads it.
 * @experimental
 */
export interface AgentEdge {
  /** Always `'edge'`. */
  readonly kind: 'edge'
  /** Key of the edge, of the first one for an edge drawn for several merged edges. */
  readonly key: AgentKey
  /** Key of the source node as drawn: a folded group stands for the nodes it hides. */
  readonly from: AgentKey
  /** Key of the target node as drawn. */
  readonly to: AgentKey
  /** Label of the edge, absent without one. */
  readonly label?: string | undefined
  /** Whether the label selection draws the label now. */
  readonly labelShown?: boolean | undefined
  /** Text drawn, when it differs from `label`. */
  readonly labelDrawn?: string | undefined
  /** Why the label is not drawn, when it is known. */
  readonly labelHidden?: AgentLabelHidden | undefined
  /** Color, width and opacity drawn. */
  readonly look: AgentEdgeLook
  /** States the edge is a member of. */
  readonly states: readonly string[]
  /** Number of edges merged into this one, absent for a plain edge. */
  readonly merged?: number | undefined
  /** `false` when the edge is outside the graph on screen; absent otherwise. */
  readonly onScreen?: false | undefined
  /** `false` when the edge is not drawn at all; absent otherwise. */
  readonly shown?: false | undefined
  /** What `describe` tells about the edge. */
  readonly data?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Color, width and opacity drawn for an edge, states applied.
 * @experimental
 */
export interface AgentEdgeLook {
  /** Color, as hex. */
  readonly color: string | null
  /** Width drawn, in CSS pixels. */
  readonly width: number
  /** Opacity, from 0 to 1. */
  readonly opacity: number
  /** `true` when a state lowers the opacity. */
  readonly dimmed?: true | undefined
}

/**
 * A shape as a query lists it.
 * @experimental
 */
export interface AgentShape {
  /** Always `'shape'`. */
  readonly kind: 'shape'
  /** Key of the shape. */
  readonly key: AgentKey
  /** Label of the shape, absent without one. */
  readonly label?: string | undefined
  /** States the shape is a member of. */
  readonly states: readonly string[]
  /** `false` when the shape is not drawn; absent otherwise. */
  readonly shown?: false | undefined
  /** What `describe` tells about the shape. */
  readonly data?: Readonly<Record<string, unknown>> | undefined
}

/**
 * The elements a list left out.
 * @experimental
 */
export interface AgentMore {
  /** Number of elements left out. */
  readonly more: number
}

/**
 * Options of `agent.query`.
 * @experimental
 */
export interface AgentQueryOptions {
  /**
   * Text to find in labels and keys, accents and case ignored: elements whose label or key starts
   * with it come first, then those that contain it. Defaults to every element.
   */
  readonly text?: string | undefined
  /** Kind of element: `'node'`, `'edge'`, `'shape'`, or `'group'` for group nodes only. */
  readonly kind?: AgentElementKind | 'group' | undefined
  /**
   * Where to look: `'view'` (on screen), `'shown'` (drawn), `'selection'`, the name of a state,
   * the name of a layer, or the key of a group for its members. Defaults to the whole data.
   */
  readonly within?: AgentKey | undefined
  /** Only the nodes up to `depth` edges from this node, and the edges between them. */
  readonly near?: AgentKey | undefined
  /**
   * Most edges from `near`.
   * @default 1
   */
  readonly depth?: number | undefined
  /**
   * Which way edges are followed from `near`: `'both'`, `'forward'` or `'backward'`.
   * @default 'both'
   */
  readonly direction?: PathDirection | undefined
  /**
   * Index of the first match to list, to read the next page.
   * @default 0
   */
  readonly from?: number | undefined
}

/**
 * Elements a query finds, 50 at a time.
 * @experimental
 */
export interface AgentQueryResult {
  /** Number of matches. */
  readonly total: number
  /** Index of the first listed match. */
  readonly from: number
  /** The matches from `from`, at most 50. */
  readonly items: readonly AgentElement[]
  /** `true` when more matches follow: query again with `from` past the last one. */
  readonly truncated: boolean
}

/**
 * An action of `agent.act`: `'select'`, `'addToSelection'`, `'clearSelection'`, `'focus'`,
 * `'fit'`, `'zoom'`, `'pan'`, `'setView'`, `'fold'`, `'unfold'`, `'toggleFold'`, `'hideLayer'`,
 * `'showLayer'`, `'setTime'`, `'clearTime'`, `'setState'`, `'clearState'`, `'path'`,
 * `'runLayout'`, `'move'` or `'resetPositions'`.
 * @experimental
 */
export type AgentAction =
  | 'select'
  | 'addToSelection'
  | 'clearSelection'
  | 'focus'
  | 'fit'
  | 'zoom'
  | 'pan'
  | 'setView'
  | 'fold'
  | 'unfold'
  | 'toggleFold'
  | 'hideLayer'
  | 'showLayer'
  | 'setTime'
  | 'clearTime'
  | 'setState'
  | 'clearState'
  | 'path'
  | 'runLayout'
  | 'move'
  | 'resetPositions'

/**
 * What an action applies to: a key, a label, `{ kind, key }`, a group key, `'selection'`,
 * `'all'`, the name of a layer for `hideLayer` and `showLayer`, or a list of them. A label must
 * name one node.
 * @experimental
 */
export type AgentTargetInput =
  | AgentKey
  | AgentTarget
  | 'selection'
  | 'all'
  | readonly (AgentKey | AgentTarget)[]

/**
 * A step of `agent.act`.
 * @experimental
 */
export interface AgentStep {
  /** The action. */
  readonly action: AgentAction
  /** What the action applies to. */
  readonly target?: AgentTargetInput | undefined
  /** Arguments of the action, such as `name` for `setState` or `start` for `setTime`. */
  readonly args?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Options of `agent.act`.
 * @experimental
 */
export interface AgentActRequest {
  /** The steps, run in order up to the first that fails. Nothing is undone. */
  readonly steps: readonly AgentStep[]
  /**
   * Waits for `settled()` after the steps, so that `changed` tells the result.
   * @default true
   */
  readonly wait?: boolean | undefined
  /**
   * Longest wait for `settled()`, in milliseconds.
   * @default 10000
   */
  readonly timeout?: number | undefined
}

/**
 * Result of `agent.act`.
 * @experimental
 */
export interface AgentActResult {
  /** `true` when every step ran. */
  readonly ok: boolean
  /** The step that failed and why. */
  readonly error?: AgentActError | undefined
  /** The steps that ran, the failed one last. */
  readonly steps: readonly AgentStepResult[]
  /** What changed in the graph, so that a new snapshot is seldom needed. */
  readonly changed: AgentChanged
  /** `true` when the graph settled before the timeout, or when `wait` is `false`. */
  readonly settled: boolean
}

/**
 * The step of `agent.act` that failed.
 * @experimental
 */
export interface AgentActError {
  /** Index of the step. */
  readonly step: number
  /** What went wrong, for the agent to read. */
  readonly message: string
  /** Elements the target may have meant. */
  readonly candidates?: readonly unknown[] | undefined
}

/**
 * A step of `agent.act` that ran.
 * @experimental
 */
export interface AgentStepResult {
  /** The action. */
  readonly action: AgentAction
  /** `false` for the step that failed. */
  readonly ok: boolean
  /** What the action gives back, such as the path found or the duration of a layout run. */
  readonly result?: unknown
}

/**
 * What `agent.act` changed. A field is absent when it did not change.
 * @experimental
 */
export interface AgentChanged {
  /** The selection after the steps, at most 50 keys of each kind. */
  readonly selection?: AgentKeys | undefined
  /** The view after the steps. */
  readonly view?: AgentViewChange | undefined
  /** The folded groups after the steps. */
  readonly folded?: readonly AgentKey[] | undefined
  /** The time window after the steps, or `null` for none. */
  readonly time?: AgentTime | null | undefined
  /** The hidden layers after the steps. */
  readonly hiddenLayers?: readonly string[] | undefined
  /** Members of the states that changed. */
  readonly states?: Readonly<Record<string, AgentStateCount>> | undefined
  /** Nodes and edges drawn after the steps that were not before. */
  readonly appeared: AgentCountPair
  /** Nodes and edges drawn before the steps that are not after. */
  readonly disappeared: AgentCountPair
}

/**
 * A view in a change.
 * @experimental
 */
export interface AgentViewChange {
  /** Zoom: screen pixels per world unit. */
  readonly zoom: number
  /** World point at the center of the graph. */
  readonly center: readonly [number, number]
}

/**
 * What an `agent.subscribe` listener receives: `'selection'`, `'view'` (once a move ends),
 * `'fold'`, `'layers'`, `'time'`, `'positions'`, `'layout'` (a run ended) or `'issues'`.
 * @experimental
 */
export type AgentChangeType =
  | 'selection'
  | 'view'
  | 'fold'
  | 'layers'
  | 'time'
  | 'positions'
  | 'layout'
  | 'issues'

/**
 * Who made a change: `'user'`, `'api'`, `'agent'`, `'drag'` or `'layout'`.
 * @experimental
 */
export type AgentOrigin = 'user' | 'api' | 'agent' | 'drag' | 'layout'

/**
 * A change an `agent.subscribe` listener receives.
 * @experimental
 */
export interface AgentChange {
  /** What changed. */
  readonly type: AgentChangeType
  /**
   * Who made it, when known: the origin of `viewchange` and `positionchange`, and `'agent'` for
   * the other changes made by `act`.
   */
  readonly origin?: AgentOrigin | undefined
  /** When the change happened, in milliseconds since the epoch. */
  readonly time: number
  /** A short summary: the new view, counts of keys, the window, the run that ended. */
  readonly detail?: unknown
}

/**
 * The bridge between a graph and an agent, made by `createGraphAgent`: it reads what the graph
 * draws, finds elements and acts on them, through the public API of the graph.
 * @experimental
 */
export interface GraphAgent {
  /**
   * What the graph draws now, after pending data changes are applied: view, selection, states,
   * layers, time, layout, problems, and the elements on screen with their labels and looks.
   */
  snapshot(options?: AgentSnapshotOptions): AgentSnapshot
  /** Finds elements by text, kind, place or neighborhood, without listing the whole graph. */
  query(options?: AgentQueryOptions): AgentQueryResult
  /**
   * Runs steps in order up to the first that fails, then waits for the graph to settle and tells
   * what changed. Views move at once unless a step asks for a `duration`, and moves made by the
   * steps carry the origin `'agent'`.
   */
  act(request: AgentActRequest): Promise<AgentActResult>
  /**
   * Calls `listener` with the changes of the graph, from people, code and agents: a view once
   * it stops moving, not at each frame. Returns a function that unsubscribes.
   */
  subscribe(listener: (change: AgentChange) => void): () => void
  /** Unsubscribes every listener. The graph stays. */
  destroy(): void
}
