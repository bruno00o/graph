import type { LiveSource, SourceChange } from '@bruno00o/graph'

export interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface Stream {
  readonly nodes: LiveSource<Item>
  readonly edges: LiveSource<Link>
  readonly sent: () => number
  pause(paused: boolean): void
  restart(): void
  onBatch(listener: () => void): void
}

const groups = ['A', 'B', 'C', 'D', 'E']

type Listener<T> = (changes: ReadonlyArray<SourceChange<T>>) => void

function channel<T>(current: () => Iterable<T>, keyOf: (item: T) => string, active: () => void) {
  const listeners = new Set<Listener<T>>()
  const source: LiveSource<T> = {
    subscribeChanges(callback, options) {
      listeners.add(callback)
      if (options?.includeInitialState) {
        callback([...current()].map((value) => ({ type: 'insert', key: keyOf(value), value })))
      }
      active()
      return {
        unsubscribe() {
          listeners.delete(callback)
          active()
        },
      }
    },
  }
  const emit = (changes: SourceChange<T>[]) => {
    if (changes.length > 0) for (const listener of listeners) listener(changes)
  }
  return { source, emit, listened: () => listeners.size > 0 }
}

export function createStream(total: number, batch: number, every: number): Stream {
  const items = new Map<string, Item>()
  const links = new Map<string, Link>()
  const ends: string[][] = [[], [], [], [], []]
  let seed = 7
  const next = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  let timer: ReturnType<typeof setInterval> | undefined
  let paused = false
  let batchListener = () => {}

  const sync = () => {
    const wanted = !paused && items.size < total && (nodes.listened() || edges.listened())
    if (wanted && timer === undefined) timer = setInterval(tick, every)
    if (!wanted && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
  const nodes = channel(
    () => items.values(),
    (item) => item.id,
    sync,
  )
  const edges = channel(
    () => links.values(),
    (link) => link.id,
    sync,
  )

  function tick(): void {
    const added: SourceChange<Item>[] = []
    const grown = new Map<string, Item>()
    const linked: SourceChange<Link>[] = []
    for (let step = 0; step < batch && items.size < total; step++) {
      const group = Math.floor(next() * ends.length)
      const home = ends[group] ?? []
      const pool = home.length === 0 || next() < 0.08 ? ends.flat() : home
      const id = `n${items.size}`
      const item = { id, label: `Node ${items.size + 1}`, group: groups[group] ?? 'A', weight: 1 }
      items.set(id, item)
      added.push({ type: 'insert', key: id, value: item })
      const target = pool[Math.floor(next() * pool.length)]
      const other = target === undefined ? undefined : items.get(target)
      if (other) {
        const link = { id: `e${links.size}`, from: id, to: other.id }
        links.set(link.id, link)
        linked.push({ type: 'insert', key: link.id, value: link })
        const heavier = { ...other, weight: other.weight + 1 }
        items.set(other.id, heavier)
        grown.set(other.id, heavier)
        ends[groups.indexOf(other.group)]?.push(other.id)
      }
      home.push(id)
    }
    const updated = [...grown].map(([key, value]): SourceChange<Item> => {
      const fresh = added.find((change) => change.key === key)
      return fresh ? { type: 'insert', key, value } : { type: 'update', key, value }
    })
    nodes.emit([...added.filter((change) => !grown.has(String(change.key))), ...updated])
    edges.emit(linked)
    batchListener()
    sync()
  }

  return {
    nodes: nodes.source,
    edges: edges.source,
    sent: () => items.size,
    pause(value) {
      paused = value
      sync()
    },
    restart() {
      edges.emit([...links.values()].map((value) => ({ type: 'delete', key: value.id, value })))
      nodes.emit([...items.values()].map((value) => ({ type: 'delete', key: value.id, value })))
      items.clear()
      links.clear()
      for (const pool of ends) pool.length = 0
      seed = 7
      batchListener()
      sync()
    },
    onBatch(listener) {
      batchListener = listener
    },
  }
}
