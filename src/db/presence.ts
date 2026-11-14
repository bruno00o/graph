import type { Collection } from '@tanstack/db'
import { createStore, type ReadonlyStore } from '@tanstack/store'
import { dev } from '../dev'
import { isolateSubscribers, report } from '../host/isolate'
import type { GraphInstance } from '../host/mount-graph'
import { readonlyOf } from '../host/readonly-store'
import type { FieldOf, FreeState, Key, KeyList, Point } from '../types'
import { pace, type Settling } from './pending'

/** Keys of the elements a participant has selected. */
export interface PresenceSelection {
  /** Selected node keys. */
  readonly nodes?: readonly Key[] | undefined
  /** Selected edge keys. */
  readonly edges?: readonly Key[] | undefined
  /** Selected shape keys. */
  readonly shapes?: readonly Key[] | undefined
}

/** What `showPresence` writes to the row of the local participant. */
export interface PresenceValues {
  /** Pointer position in world units, or `null` while the pointer is off the graph. */
  readonly pointer: Point | null
  /** Selected elements, or `null` when nothing is selected. */
  readonly selection: PresenceSelection | null
  /** Time of the write, in milliseconds since the epoch. */
  readonly time: number
}

/** Fields of a presence row that `showPresence` reads and writes. `T` is the type of the rows. */
export interface PresenceFields<T> {
  /**
   * Field of the pointer, a point in world units or `null`.
   * @default 'pointer'
   */
  readonly pointer?: FieldOf<T, Point> | undefined
  /**
   * Field of the selection, a `PresenceSelection` or `null`.
   * @default 'selection'
   */
  readonly selection?: FieldOf<T, PresenceSelection> | undefined
  /**
   * Field of the time of the last write, in milliseconds since the epoch.
   * @default 'time'
   */
  readonly time?: FieldOf<T, number> | undefined
}

/** Another participant, as `showPresence` lists it. `TKey` is the type of the row keys. */
export interface PresenceParticipant<TKey extends string | number = string | number> {
  /** Key of the row of the participant. */
  readonly id: TKey
  /** Rank of the participant among the states, from 0. Participants beyond the states share one. */
  readonly slot: number
  /** Free state that shows the selection of the participant, or `null` when there is none. */
  readonly state: string | null
}

/**
 * Options of `showPresence`. `T` is the type of the rows, `TKey` the type of their keys and `S` the
 * union of the free state names of the graph.
 */
export interface ShowPresenceOptions<
  T extends object,
  TKey extends string | number,
  S extends string = string,
> {
  /** Collection of presence rows, one per participant, that the app syncs between clients. */
  readonly collection: Collection<T, TKey>
  /** Key of the row of the local participant. */
  readonly me: TKey
  /** Builds the row of the local participant the first time it is written. */
  readonly create: (me: TKey, presence: PresenceValues) => T
  /** Fields of a row that hold the pointer, the selection and the time. */
  readonly fields?: PresenceFields<T> | undefined
  /**
   * Free states that show the selections of the others, one for each participant, in order.
   * Defaults to the states of `presence1` to `presence8` that the graph declares. A name that
   * the graph does not declare throws.
   */
  readonly states?: KeyList<S> | undefined
  /**
   * Makes the element that follows the pointer of a participant. Defaults to a small colored dot
   * without text. `false` shows no cursors.
   */
  readonly cursor?: ((participant: PresenceParticipant<TKey>) => HTMLElement) | false | undefined
  /**
   * CSS colors of the default cursors, by slot. Defaults to `var(--graph-cat-1)` to
   * `var(--graph-cat-8)`.
   */
  readonly colors?: KeyList<string> | undefined
  /**
   * Shortest time between two writes, in milliseconds. A write that took long delays the next one
   * by four times as long.
   * @default 50
   */
  readonly wait?: number | undefined
  /**
   * Age in milliseconds after which a row no longer counts, so that a participant who left without
   * a trace disappears. The local participant rewrites its row a third of this time apart while
   * idle. `Infinity` keeps rows for good. Rows are compared with the clock of this client.
   * @default 30000
   */
  readonly expire?: number | undefined
  /**
   * Most keys written for each of nodes, edges and shapes of the selection. A larger selection
   * is cut. `Infinity` writes all of it.
   * @default 500
   */
  readonly maxSelection?: number | undefined
}

/** What `showPresence` returns. `TKey` is the type of the row keys. */
export interface Presence<TKey extends string | number = string | number> {
  /** The other participants whose rows are recent, which changes when one joins or leaves. */
  readonly store: ReadonlyStore<readonly PresenceParticipant<TKey>[]>
  /** Stops showing and writing, removes the row of the local participant and the cursors. */
  stop(): void
}

const defaultWait = 50
const defaultExpire = 30_000
const defaultMax = 500
const defaultSlots = 8
const rest = 4
const longestTimer = 2 ** 31 - 1

interface Selected {
  readonly nodes: readonly Key[]
  readonly edges: readonly Key[]
  readonly shapes: readonly Key[]
}

interface Entry<TKey extends string | number> {
  readonly id: TKey
  readonly slot: number
  readonly element: HTMLElement | null
  readonly order: number
  pointer: Point | null
  selected: Selected
  time: number
  placed: boolean
}

const noKeys: readonly Key[] = []
const nobody: Selected = { nodes: noKeys, edges: noKeys, shapes: noKeys }

function positive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback
  if (Number.isNaN(value) || value <= 0) {
    throw new RangeError(`showPresence: ${name} must be above 0, got ${value}`)
  }
  return value
}

function isKey(value: unknown): value is Key {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function keysOf(value: unknown, max: number): readonly Key[] {
  if (!Array.isArray(value) || value.length === 0) return noKeys
  const keys: Key[] = []
  for (const key of value) {
    if (!isKey(key)) continue
    keys.push(key)
    if (keys.length >= max) break
  }
  return keys.length === 0 ? noKeys : keys
}

function selectedOf(value: unknown, max: number): Selected {
  if (typeof value !== 'object' || value === null) return nobody
  const given = value as { nodes?: unknown; edges?: unknown; shapes?: unknown }
  const nodes = keysOf(given.nodes, max)
  const edges = keysOf(given.edges, max)
  const shapes = keysOf(given.shapes, max)
  return nodes === noKeys && edges === noKeys && shapes === noKeys
    ? nobody
    : { nodes, edges, shapes }
}

function sameKeys(a: readonly Key[], b: readonly Key[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false
  return true
}

function sameSelected(a: Selected, b: Selected): boolean {
  return (
    a === b ||
    (sameKeys(a.nodes, b.nodes) && sameKeys(a.edges, b.edges) && sameKeys(a.shapes, b.shapes))
  )
}

function pointOf(value: unknown): Point | null {
  if (typeof value !== 'object' || value === null) return null
  const { x, y } = value as { x?: unknown; y?: unknown }
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null
}

function compare(a: Key, b: Key): number {
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0
  return typeof a === 'number' ? -1 : 1
}

function defaultCursor(color: string): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute('data-graph-presence', '')
  element.style.cssText = `width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:${color};border:2px solid var(--graph-paper,#fff);box-shadow:0 0 0 1px ${color}`
  return element
}

/**
 * Shows who else is editing, from a collection of presence rows that the app shares between
 * clients: a cursor for the pointer of each other participant, and their selections in free states.
 * It writes the pointer and the selection of the local participant at most every `wait`
 * milliseconds, and ignores the rows older than `expire`. It sends nothing itself: the collection
 * handlers carry the rows. Throws when a name of `states` is not a free state of the graph.
 */
export function showPresence<
  T extends object,
  TKey extends string | number,
  S extends string = string,
>(graph: GraphInstance<S>, options: ShowPresenceOptions<T, TKey, FreeState<S>>): Presence<TKey> {
  const { collection, me, create } = options
  const wait = options.wait === undefined ? defaultWait : options.wait
  if (Number.isNaN(wait) || wait < 0) {
    throw new RangeError(`showPresence: wait must be 0 or more, got ${wait}`)
  }
  const expire = positive(options.expire, defaultExpire, 'expire')
  const max = positive(options.maxSelection, defaultMax, 'maxSelection')
  const states = graph.states as unknown as {
    set(name: string, keys: object): void
    clear(name: string): void
  }
  const declared = (name: string) => Object.hasOwn(graph.store.state.states, name)
  let names: string[]
  if (options.states) {
    names = [...options.states]
    for (const name of names) {
      if (!declared(name)) {
        throw new Error(`graph: presence state "${name}" is not a free state of the graph`)
      }
    }
  } else {
    names = Array.from({ length: defaultSlots }, (_, index) => `presence${index + 1}`).filter(
      declared,
    )
  }
  const colors = options.colors
    ? [...options.colors]
    : Array.from({ length: defaultSlots }, (_, index) => `var(--graph-cat-${index + 1})`)
  if (colors.length === 0) colors.push('currentColor')
  const slotCount = names.length > 0 ? names.length : defaultSlots
  const fields = {
    pointer: options.fields?.pointer ?? 'pointer',
    selection: options.fields?.selection ?? 'selection',
    time: options.fields?.time ?? 'time',
  }

  const store = createStore<readonly PresenceParticipant<TKey>[]>([])
  const view = isolateSubscribers(readonlyOf(store))
  if (graph.signal.aborted) return { store: view, stop() {} }

  const entries = new Map<TKey, Entry<TKey>>()
  const loads: number[] = Array.from({ length: slotCount }, () => 0)
  const dirty = new Set<number>()
  let arrivals = 0
  let listed = false
  let stopped = false
  let sweeper: ReturnType<typeof setTimeout> | undefined
  let armedAt = Infinity
  let warned = false

  const fail = (error: unknown) => {
    if (dev && !warned) {
      warned = true
      console.warn('showPresence: a presence write failed', error)
    }
  }

  const slotFor = (): number => {
    let best = 0
    for (let slot = 1; slot < slotCount; slot++) {
      if ((loads[slot] ?? 0) < (loads[best] ?? 0)) best = slot
    }
    return best
  }

  const join = (id: TKey): Entry<TKey> => {
    const slot = slotFor()
    loads[slot] = (loads[slot] ?? 0) + 1
    const participant: PresenceParticipant<TKey> = { id, slot, state: names[slot] ?? null }
    let element: HTMLElement | null = null
    if (options.cursor !== false) {
      try {
        element = options.cursor
          ? options.cursor(participant)
          : defaultCursor(colors[slot % colors.length] ?? 'currentColor')
      } catch (error) {
        report(error)
      }
    }
    const entry: Entry<TKey> = {
      id,
      slot,
      element,
      order: arrivals++,
      pointer: null,
      selected: nobody,
      time: 0,
      placed: false,
    }
    entries.set(id, entry)
    listed = true
    return entry
  }

  const place = (entry: Entry<TKey>) => {
    const element = entry.element
    if (!element) return
    if (entry.pointer) {
      graph.anchors.set(element, { point: entry.pointer, side: 'center', align: 'center' })
      entry.placed = true
    } else if (entry.placed) {
      graph.anchors.remove(element)
      entry.placed = false
    }
  }

  const drop = (entry: Entry<TKey>) => {
    entries.delete(entry.id)
    loads[entry.slot] = (loads[entry.slot] ?? 1) - 1
    if (entry.element) graph.anchors.remove(entry.element)
    if (entry.selected !== nobody) dirty.add(entry.slot)
    listed = true
  }

  const read = (entry: Entry<TKey>, row: object) => {
    const record = row as Record<string, unknown>
    entry.time = record[fields.time] as number
    const pointer = pointOf(record[fields.pointer])
    const before = entry.pointer
    if (pointer?.x !== before?.x || pointer?.y !== before?.y) {
      entry.pointer = pointer
      place(entry)
    }
    const selected = selectedOf(record[fields.selection], max)
    if (!sameSelected(selected, entry.selected)) {
      entry.selected = selected
      dirty.add(entry.slot)
    }
  }

  const settle = () => {
    for (const slot of dirty) {
      const name = names[slot]
      if (name === undefined || !declared(name)) continue
      const members = [...entries.values()].filter(
        (entry) => entry.slot === slot && entry.selected !== nobody,
      )
      if (members.length === 0) states.clear(name)
      else if (members.length === 1) {
        const only = (members[0] as Entry<TKey>).selected
        states.set(name, only)
      } else {
        states.set(name, {
          nodes: members.flatMap((entry) => entry.selected.nodes),
          edges: members.flatMap((entry) => entry.selected.edges),
          shapes: members.flatMap((entry) => entry.selected.shapes),
        })
      }
    }
    dirty.clear()
    if (!listed) return
    listed = false
    store.setState(() =>
      [...entries.values()]
        .sort((a, b) => a.slot - b.slot || a.order - b.order)
        .map((entry) => ({ id: entry.id, slot: entry.slot, state: names[entry.slot] ?? null })),
    )
  }

  const sweep = () => {
    sweeper = undefined
    armedAt = Infinity
    if (stopped) return
    const now = Date.now()
    let next = Infinity
    for (const entry of [...entries.values()]) {
      if (now - entry.time > expire) drop(entry)
      else next = Math.min(next, entry.time + expire)
    }
    settle()
    arm(next)
  }

  function arm(next: number): void {
    if (!Number.isFinite(next) || stopped || (sweeper !== undefined && armedAt <= next)) return
    if (sweeper !== undefined) clearTimeout(sweeper)
    armedAt = next
    sweeper = setTimeout(sweep, Math.min(Math.max(next - Date.now() + 1, 1), longestTimer))
  }

  const recent = (row: object, now: number): boolean => {
    const time = (row as Record<string, unknown>)[fields.time]
    return typeof time === 'number' && Number.isFinite(time) && now - time <= expire
  }

  const apply = (changes: readonly { type: string; key: TKey; value: T }[]) => {
    if (stopped) return
    const now = Date.now()
    const fresh: TKey[] = []
    for (const change of changes) {
      if (change.key === me) continue
      if (change.type === 'delete') {
        const entry = entries.get(change.key)
        if (entry) drop(entry)
      } else if (recent(change.value, now)) {
        if (!entries.has(change.key) && !fresh.includes(change.key)) fresh.push(change.key)
      } else {
        const entry = entries.get(change.key)
        if (entry) drop(entry)
      }
    }
    for (const id of fresh.sort(compare)) join(id)
    for (const change of changes) {
      if (change.key === me || change.type === 'delete') continue
      const entry = entries.get(change.key)
      if (!entry || !recent(change.value, now)) continue
      read(entry, change.value)
      arm(entry.time + expire)
    }
    settle()
  }

  let subscription: { unsubscribe(): void } | null = null
  const watch = () => {
    subscription = collection.subscribeChanges(
      (changes) => {
        try {
          apply(changes)
        } catch (error) {
          report(error)
        }
      },
      { includeInitialState: true },
    )
  }

  let pointer: Point | null = null
  let selection: PresenceSelection | null = null
  let written = 0

  const selectionNow = (): PresenceSelection | null => {
    const picked = graph.selection.get() as {
      readonly nodes: readonly Key[]
      readonly edges: readonly Key[]
      readonly shapes?: readonly Key[]
    }
    const nodes = picked.nodes.slice(0, max)
    const edges = picked.edges.slice(0, max)
    const shapes = (picked.shapes ?? noKeys).slice(0, max)
    return nodes.length + edges.length + shapes.length === 0 ? null : { nodes, edges, shapes }
  }

  const track = (transaction: Settling) => {
    transaction.when('settled').catch(fail)
  }

  const write = () => {
    if (stopped) return
    written = Date.now()
    const values: PresenceValues = { pointer, selection, time: written }
    try {
      if (collection.has(me)) {
        track(
          collection.update(me, (draft) => {
            const row = draft as Record<string, unknown>
            row[fields.pointer] = values.pointer
            row[fields.selection] = values.selection
            row[fields.time] = values.time
          }),
        )
      } else {
        track(collection.insert(create(me, values)))
      }
    } catch (error) {
      fail(error)
    }
  }

  const paced = pace(wait, write, rest)

  const leave = () => {
    paced.cancel()
    try {
      if (collection.has(me)) track(collection.delete(me))
    } catch (error) {
      fail(error)
    }
  }

  const offMove = graph.on('pointermove', (event) => {
    const world = event.world
    if (pointer && pointer.x === world.x && pointer.y === world.y) return
    pointer = { x: world.x, y: world.y }
    paced.call()
  })
  const offSelect = graph.on('selectionchange', () => {
    selection = selectionNow()
    paced.call()
  })
  const onLeave = () => {
    if (pointer === null) return
    pointer = null
    paced.call()
  }
  graph.element.addEventListener('pointerleave', onLeave)
  const heartbeat = expire / 3
  const beat = Number.isFinite(heartbeat)
    ? setInterval(() => {
        if (Date.now() - written >= heartbeat) paced.call()
      }, heartbeat)
    : undefined
  const onHide = () => leave()
  const hasWindow = typeof window !== 'undefined'
  if (hasWindow) window.addEventListener('pagehide', onHide)

  function stop(): void {
    if (stopped) return
    stopped = true
    graph.signal.removeEventListener('abort', stop)
    subscription?.unsubscribe()
    offMove()
    offSelect()
    graph.element.removeEventListener('pointerleave', onLeave)
    if (beat !== undefined) clearInterval(beat)
    if (sweeper !== undefined) clearTimeout(sweeper)
    if (hasWindow) window.removeEventListener('pagehide', onHide)
    for (const entry of entries.values()) {
      if (entry.element) graph.anchors.remove(entry.element)
    }
    entries.clear()
    for (const name of names) if (declared(name)) states.clear(name)
    leave()
  }

  graph.signal.addEventListener('abort', stop, { once: true })
  selection = selectionNow()
  watch()
  paced.call()
  return { store: view, stop }
}
