import { freeStateNames } from '../core/state-names'
import type { ElementKeysInput } from '../host/events'
import type { GraphCore, GraphInstance, GraphState } from '../host/graph-instance'
import type { GraphInternals } from '../host/internals'
import type { Key, PathDirection, View } from '../types'
import { folded, readKey, readKeys, rounded, timeOut, writeKey } from './keys'
import type { Changes } from './subscribe'
import type {
  AgentActError,
  AgentAction,
  AgentActRequest,
  AgentActResult,
  AgentChanged,
  AgentStateCount,
  AgentStepResult,
} from './types'

const fitZoom = 2
const settleWait = 10_000
const longestTimer = 2 ** 31 - 1

type Kind = 'node' | 'edge' | 'shape'

interface Target {
  readonly kind: Kind
  readonly key: Key
}

class StepError extends Error {
  readonly candidates: readonly unknown[] | undefined

  constructor(message: string, candidates?: readonly unknown[]) {
    super(message)
    this.candidates = candidates
  }
}

interface Args {
  readonly [name: string]: unknown
  readonly name?: unknown
  readonly state?: unknown
  readonly start?: unknown
  readonly end?: unknown
  readonly direction?: unknown
  readonly weight?: unknown
  readonly visible?: unknown
  readonly fit?: unknown
  readonly x?: unknown
  readonly y?: unknown
}

interface Context {
  readonly graph: GraphCore
  readonly internals: GraphInternals
}

function exists(context: Context, kind: Kind, key: Key): boolean {
  const { graph, internals } = context
  if (kind === 'node' && internals.indexOf('nodes', key) >= 0) return true
  if (kind === 'edge' && internals.indexOf('edges', key) >= 0) return true
  try {
    return graph.datumOf({ kind, key }) !== undefined
  } catch {
    return false
  }
}

function byLabel(context: Context, text: string): Target[] {
  const { nodes } = context.internals.scene
  const wanted = folded(text)
  const found: Key[] = []
  const close: { key: unknown; label: string }[] = []
  for (let index = 0; index < nodes.capacity; index++) {
    const label = nodes.label[index]
    const key = nodes.keys[index]
    if (nodes.alive[index] !== 1 || !label || key === undefined) continue
    const name = folded(label)
    if (name === wanted) found.push(key)
    else if (close.length < 5 && name.includes(wanted)) close.push({ key: readKey(key), label })
  }
  if (found.length === 1) return [{ kind: 'node', key: found[0] as Key }]
  if (found.length > 1) {
    throw new StepError(
      `the label "${text}" names ${found.length} nodes; pass a key`,
      found.slice(0, 10).map(readKey),
    )
  }
  throw new StepError(`no node or edge has the key or label "${text}"; call query first`, close)
}

function resolve(context: Context, target: unknown): Target[] {
  const { graph } = context
  if (target === 'selection') {
    const keys = graph.selection.get()
    return [
      ...keys.nodes.map((key) => ({ kind: 'node' as const, key })),
      ...keys.edges.map((key) => ({ kind: 'edge' as const, key })),
      ...(keys.shapes ?? []).map((key) => ({ kind: 'shape' as const, key })),
    ]
  }
  if (target === 'all') {
    throw new StepError(
      '"all" stands for every element only with fit, fold, unfold, resetPositions and runLayout',
    )
  }
  if (Array.isArray(target)) return target.flatMap((each) => resolve(context, each))
  if (typeof target === 'object' && target !== null && 'kind' in target) {
    const { kind, key } = target as { kind?: unknown; key?: unknown }
    if (kind !== 'node' && kind !== 'edge' && kind !== 'shape') {
      throw new StepError(`kind must be "node", "edge" or "shape", not ${JSON.stringify(kind)}`)
    }
    const own = writeKey(graph, key)
    if (own !== null && exists(context, kind, own)) return [{ kind, key: own }]
    const number = typeof own === 'string' && own.trim() !== '' ? Number(own) : Number.NaN
    if (Number.isFinite(number) && exists(context, kind, number)) return [{ kind, key: number }]
    throw new StepError(`unknown ${kind} key ${JSON.stringify(key)}; call query first`)
  }
  if (typeof target === 'object' && target !== null) {
    const own = writeKey(graph, target)
    if (own === null || !exists(context, 'node', own)) {
      throw new StepError(`unknown group ${JSON.stringify(target)}; call query with kind "group"`)
    }
    return [{ kind: 'node', key: own }]
  }
  if (typeof target === 'number' || typeof target === 'string') {
    const keys: Key[] = [target]
    if (typeof target === 'string' && target.trim() !== '' && Number.isFinite(Number(target))) {
      keys.push(Number(target))
    }
    for (const kind of ['node', 'edge', 'shape'] as const) {
      for (const key of keys) if (exists(context, kind, key)) return [{ kind, key }]
    }
    if (typeof target === 'string') return byLabel(context, target)
    throw new StepError(`unknown key ${target}; call query first`)
  }
  throw new StepError(`cannot read the target ${JSON.stringify(target)}`)
}

function keysOf(targets: readonly Target[]): {
  nodes: Key[]
  edges: Key[]
  shapes: Key[]
} {
  const out = { nodes: [] as Key[], edges: [] as Key[], shapes: [] as Key[] }
  for (const { kind, key } of targets) out[`${kind}s`].push(key)
  return out
}

function selectionInput(keys: ReturnType<typeof keysOf>, shaped: boolean): ElementKeysInput {
  return shaped || keys.shapes.length > 0 ? keys : { nodes: keys.nodes, edges: keys.edges }
}

function nodesOf(context: Context, target: unknown, action: string): Key[] {
  const targets = resolve(context, target)
  const wrong = targets.find((each) => each.kind !== 'node')
  if (wrong)
    throw new StepError(
      `${action} takes nodes, not the ${wrong.kind} ${JSON.stringify(readKey(wrong.key))}`,
    )
  return targets.map((each) => each.key)
}

function number(args: Args, name: string, fallback?: number): number {
  const value = args[name]
  if (value === undefined && fallback !== undefined) return fallback
  const read = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof read !== 'number' || !Number.isFinite(read)) {
    throw new StepError(`${name} must be a finite number, not ${JSON.stringify(value)}`)
  }
  return read
}

function optional(args: Args, name: string): number | undefined {
  return args[name] === undefined ? undefined : number(args, name)
}

function timeOf(value: unknown, name: string): number | null {
  if (value === undefined || value === null || value === 'open') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    if (value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  throw new StepError(
    `${name} must be an ISO 8601 date, milliseconds or null, not ${JSON.stringify(value)}`,
  )
}

function duration(args: Args): number {
  return number(args, 'duration', 0)
}

function stateName(context: Context, args: Args, required: boolean): string | undefined {
  const name = args.name ?? args.state
  const names = freeStateNames(context.internals.definition().states)
  if (name === undefined && !required) return undefined
  if (typeof name !== 'string' || !names.includes(name)) {
    throw new StepError(
      `the state ${JSON.stringify(name)} is not declared in the definition; states: ${names.join(', ') || 'none'}`,
      names,
    )
  }
  return name
}

function layerNames(context: Context, target: unknown): string[] {
  const names = context.graph.layers.names() as readonly string[]
  if (target === 'all' || target === undefined) return [...names]
  const wanted = Array.isArray(target) ? target : [target]
  for (const name of wanted) {
    if (typeof name !== 'string' || !names.includes(name)) {
      throw new StepError(
        `unknown layer ${JSON.stringify(name)}; layers: ${names.join(', ') || 'none'}`,
        names,
      )
    }
  }
  return wanted as string[]
}

function groupKeys(context: Context, target: unknown): Key[] | undefined {
  return target === undefined || target === 'all' ? undefined : nodesOf(context, target, 'fold')
}

function fitView(context: Context, target: unknown, args: Args): void {
  const view = context.graph.view
  const maxZoom = number(args, 'maxZoom', fitZoom)
  const padding = optional(args, 'padding')
  const options = {
    duration: duration(args),
    maxZoom,
    ...(padding !== undefined ? { padding } : {}),
  }
  if (target === undefined || target === 'all') {
    view.fit(options)
    return
  }
  const keys = keysOf(resolve(context, target))
  view.fit({ ...options, nodes: keys.nodes, edges: keys.edges, shapes: keys.shapes })
}

type Run = (context: Context, target: unknown, args: Args) => unknown

const actions: Readonly<Record<AgentAction, Run>> = {
  select(context, target) {
    const keys = keysOf(resolve(context, target))
    context.graph.selection.set(
      selectionInput(keys, context.graph.selection.get().shapes !== undefined),
    )
  },
  addToSelection(context, target) {
    const now = context.graph.selection.get()
    const more = keysOf(resolve(context, target))
    const keys = {
      nodes: [...new Set([...now.nodes, ...more.nodes])],
      edges: [...new Set([...now.edges, ...more.edges])],
      shapes: [...new Set([...(now.shapes ?? []), ...more.shapes])],
    }
    context.graph.selection.set(selectionInput(keys, now.shapes !== undefined))
  },
  clearSelection(context) {
    context.graph.selection.clear()
  },
  focus(context, target) {
    const focus = (context.graph as Partial<GraphInstance>).focus
    if (!focus) throw new StepError('focus needs a graph on a page; this one has no keyboard focus')
    if (target === null) {
      focus.set(null)
      return
    }
    const [key] = nodesOf(context, target, 'focus')
    if (key === undefined) throw new StepError('focus takes one node')
    focus.set({ kind: 'node', key })
  },
  fit(context, target, args) {
    fitView(context, target, args)
  },
  zoom(context, _target, args) {
    const factor = number(args, 'by', number(args, 'factor', 2))
    if (factor <= 0) throw new StepError('by must be more than 0')
    context.graph.view.zoomBy(factor, { duration: duration(args) })
  },
  pan(context, _target, args) {
    const view = context.graph.view.get()
    const x = number(args, 'x', 0)
    const y = number(args, 'y', 0)
    context.graph.view.set(
      { x: view.x + x / view.zoom, y: view.y + y / view.zoom, zoom: view.zoom },
      { duration: duration(args) },
    )
  },
  setView(context, _target, args) {
    const view: View = context.graph.view.get()
    context.graph.view.set(
      {
        x: number(args, 'x', view.x),
        y: number(args, 'y', view.y),
        zoom: number(args, 'zoom', view.zoom),
      },
      { duration: duration(args) },
    )
  },
  fold(context, target) {
    context.graph.groups.fold(groupKeys(context, target))
  },
  unfold(context, target) {
    context.graph.groups.unfold(groupKeys(context, target))
  },
  toggleFold(context, target) {
    for (const key of nodesOf(context, target, 'toggleFold')) context.graph.groups.toggle(key)
  },
  hideLayer(context, target) {
    context.graph.layers.hide(layerNames(context, target) as never)
  },
  showLayer(context, target) {
    context.graph.layers.show(layerNames(context, target) as never)
  },
  setTime(context, _target, args) {
    context.graph.time.set({
      start: timeOf(args.start, 'start'),
      end: timeOf(args.end, 'end'),
    })
  },
  clearTime(context) {
    context.graph.time.set(null)
  },
  setState(context, target, args) {
    const name = stateName(context, args, true) as string
    context.graph.states.set(name as never, keysOf(resolve(context, target ?? [])))
  },
  clearState(context, _target, args) {
    context.graph.states.clear(stateName(context, args, false) as never)
  },
  path(context, target, args) {
    const ends = nodesOf(context, target, 'path')
    const [from, to] = ends
    if (ends.length !== 2 || from === undefined || to === undefined) {
      throw new StepError('path takes two nodes: the start and the end')
    }
    const direction = (args.direction ?? 'both') as PathDirection
    if (direction !== 'both' && direction !== 'forward' && direction !== 'backward') {
      throw new StepError('direction must be "both", "forward" or "backward"')
    }
    const weight = args.weight
    if (weight !== undefined && typeof weight !== 'string')
      throw new StepError('weight must be the name of a field')
    const found = context.graph.paths.shortest(from, to, {
      direction,
      ...(weight !== undefined ? { weight: weight as never } : {}),
      ...(args.visible === true ? { visible: true } : {}),
    })
    if (!found) return { found: false }
    const state =
      args.state === undefined ? undefined : stateName(context, { name: args.state }, true)
    if (state !== undefined)
      context.graph.states.set(state as never, { nodes: found.nodes, edges: found.edges })
    return {
      found: true,
      nodes: readKeys(found.nodes, 200),
      edges: readKeys(found.edges, 200),
      cost: found.cost,
    }
  },
  async runLayout(context, target, args) {
    const started = performance.now()
    const keys =
      target === undefined || target === 'all' ? undefined : nodesOf(context, target, 'runLayout')
    const fit = args.fit === true
    const completed = await context.graph.layout.run(undefined, {
      ...(keys ? { keys } : {}),
      ...(fit ? { fit: { duration: 0, maxZoom: fitZoom } } : {}),
      duration: duration(args),
    })
    return { completed, ms: Math.round(performance.now() - started) }
  },
  move(context, target, args) {
    const [key, more] = nodesOf(context, target, 'move')
    if (key === undefined || more !== undefined) throw new StepError('move takes one node')
    const at = context.graph.positions.get(key)
    if (!at) throw new StepError(`the node ${JSON.stringify(readKey(key))} has no position`)
    const zoom = context.graph.view.get().zoom
    const x = args.x !== undefined ? number(args, 'x') : at.x + number(args, 'dx', 0) / zoom
    const y = args.y !== undefined ? number(args, 'y') : at.y + number(args, 'dy', 0) / zoom
    context.graph.positions.set([[key, { x, y }]], { duration: duration(args) })
    return { x: rounded(x, 2), y: rounded(y, 2) }
  },
  resetPositions(context, target, args) {
    const keys =
      target === undefined || target === 'all'
        ? undefined
        : nodesOf(context, target, 'resetPositions')
    context.graph.positions.reset(keys, { duration: duration(args) })
  },
}

interface Before {
  readonly state: GraphState
  readonly shown: ReturnType<GraphCore['shown']>
}

function shownChange(
  before: ReturnType<GraphCore['shown']>,
  after: ReturnType<GraphCore['shown']>,
): { appeared: { nodes: number; edges: number }; disappeared: { nodes: number; edges: number } } {
  const delta = (was: readonly Key[], now: readonly Key[]) => {
    if (was === now) return [0, 0] as const
    const old = new Set(was)
    let appeared = 0
    for (const key of now) if (!old.has(key)) appeared++
    return [appeared, was.length - (now.length - appeared)] as const
  }
  const [nodesIn, nodesOut] = delta(before.nodes, after.nodes)
  const [edgesIn, edgesOut] = delta(before.edges, after.edges)
  return {
    appeared: { nodes: nodesIn, edges: edgesIn },
    disappeared: { nodes: nodesOut, edges: edgesOut },
  }
}

function changedOf(graph: GraphCore, before: Before): AgentChanged {
  const was = before.state
  const now = graph.store.state
  const out: {
    -readonly [K in keyof AgentChanged]: AgentChanged[K]
  } = { ...shownChange(before.shown, graph.shown()) }
  if (now.selection !== was.selection) {
    const selection = now.selection
    out.selection = {
      nodes: readKeys(selection.nodes),
      edges: readKeys(selection.edges),
      ...(selection.shapes && selection.shapes.length > 0
        ? { shapes: readKeys(selection.shapes) }
        : {}),
    }
  }
  const view = now.view
  if (view.x !== was.view.x || view.y !== was.view.y || view.zoom !== was.view.zoom) {
    out.view = { zoom: rounded(view.zoom, 4), center: [rounded(view.x, 2), rounded(view.y, 2)] }
  }
  if (now.folded !== was.folded) out.folded = readKeys(now.folded)
  if (
    now.time !== was.time &&
    (now.time?.start !== was.time?.start || now.time?.end !== was.time?.end)
  ) {
    out.time = now.time ? { start: timeOut(now.time.start), end: timeOut(now.time.end) } : null
  }
  if (now.hiddenLayers !== was.hiddenLayers) out.hiddenLayers = [...now.hiddenLayers]
  if (now.states !== was.states) {
    const states: Record<string, AgentStateCount> = {}
    const all = now.states as Readonly<Record<string, GraphState['selection']>>
    const old = was.states as Readonly<Record<string, GraphState['selection']>>
    for (const [name, keys] of Object.entries(all)) {
      if (keys === old[name]) continue
      const shapes = keys.shapes?.length ?? 0
      states[name] = {
        nodes: keys.nodes.length,
        edges: keys.edges.length,
        ...(shapes > 0 ? { shapes } : {}),
      }
    }
    if (Object.keys(states).length > 0) out.states = states
  }
  return out
}

function settle(graph: GraphCore, timeout: number): Promise<boolean> {
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), Math.min(timeout, longestTimer))
    graph.settled().then(
      () => {
        clearTimeout(timer)
        done(true)
      },
      () => {
        clearTimeout(timer)
        done(false)
      },
    )
  })
}

function failure(step: number, cause: unknown): AgentActError {
  const message = cause instanceof Error ? cause.message : String(cause)
  const candidates = cause instanceof StepError ? cause.candidates : undefined
  return { step, message, ...(candidates && candidates.length > 0 ? { candidates } : {}) }
}

export async function runAct(
  graph: GraphCore,
  internals: GraphInternals,
  changes: Changes,
  request: AgentActRequest,
): Promise<AgentActResult> {
  const steps = request?.steps
  if (!Array.isArray(steps)) throw new TypeError('act: pass { steps: [{ action, target, args }] }')
  const timeout = request.timeout ?? settleWait
  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new RangeError('act: timeout must be a number of milliseconds, 0 or more')
  }
  const context: Context = { graph, internals }
  const before: Before = { state: graph.store.state, shown: graph.shown() }
  const done: AgentStepResult[] = []
  let error: AgentActError | undefined
  const work = async () => {
    for (const [at, step] of steps.entries()) {
      const action = (step as { action?: unknown } | null)?.action
      const run = typeof action === 'string' ? actions[action as AgentAction] : undefined
      if (!run || !Object.hasOwn(actions, action as string)) {
        error = {
          step: at,
          message: `unknown action ${JSON.stringify(action)}; actions: ${Object.keys(actions).join(', ')}`,
        }
        break
      }
      try {
        const args = step.args ?? {}
        const result = await internals.agent(() => run(context, step.target, args))
        done.push({
          action: action as AgentAction,
          ok: true,
          ...(result !== undefined ? { result } : {}),
        })
      } catch (cause) {
        error = failure(at, cause)
        done.push({ action: action as AgentAction, ok: false })
        break
      }
      if (graph.destroyed) break
    }
    return request.wait === false || graph.destroyed ? !graph.destroyed : settle(graph, timeout)
  }
  const settled = await changes.during(work)
  return {
    ok: error === undefined,
    ...(error ? { error } : {}),
    steps: done,
    changed: changedOf(graph, before),
    settled,
  }
}
