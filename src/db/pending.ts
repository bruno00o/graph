import type { GraphInstance } from '../host/mount-graph'
import type { Key } from '../types'

export interface Settling {
  when(state: 'settled'): Promise<unknown>
}

export interface PendingMarks {
  hold(keys: Iterable<Key>, write: object): void
  settle(write: object, transactions: readonly Settling[]): void
}

export function pendingMarks(
  graph: GraphInstance,
  name: string | undefined,
  kind: 'nodes' | 'shapes',
): PendingMarks | null {
  if (name === undefined) return null
  const declared = () => Object.hasOwn(graph.store.state.states, name)
  if (!declared()) throw new Error(`graph: pendingState "${name}" is not a free state of the graph`)
  const owners = new Map<Key, object>()
  const release = (write: object) => {
    const done: Key[] = []
    for (const [key, owner] of owners) if (owner === write) done.push(key)
    for (const key of done) owners.delete(key)
    if (done.length > 0 && declared())
      graph.states.remove(name, kind === 'nodes' ? { nodes: done } : { shapes: done })
  }
  return {
    hold(keys, write) {
      const added: Key[] = []
      for (const key of keys) {
        if (!owners.has(key)) added.push(key)
        owners.set(key, write)
      }
      if (added.length > 0 && declared())
        graph.states.add(name, kind === 'nodes' ? { nodes: added } : { shapes: added })
    },
    settle(write, transactions) {
      if (transactions.length === 0) {
        release(write)
        return
      }
      void Promise.allSettled(transactions.map((transaction) => transaction.when('settled'))).then(
        () => release(write),
      )
    },
  }
}

export const defaultWait = 100

export function pace(
  wait: number,
  run: () => void,
  rest = 0,
): { readonly call: () => void; readonly flush: () => void; readonly cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let next = 0
  let pending = false
  const fire = () => {
    timer = undefined
    pending = false
    const start = Date.now()
    next = start + wait
    run()
    if (rest > 0) {
      const end = Date.now()
      next = Math.max(next, end + (end - start) * rest)
    }
  }
  return {
    call() {
      pending = true
      if (timer !== undefined) return
      const delay = next - Date.now()
      if (delay <= 0) fire()
      else timer = setTimeout(fire, delay)
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer)
      if (pending) fire()
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      pending = false
    },
  }
}
