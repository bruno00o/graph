import type { GraphCore } from '../host/graph-instance'
import { readKey, rounded, timeOut } from './keys'
import type { AgentChange, AgentChangeType, AgentOrigin } from './types'

const viewQuiet = 150

export interface Changes {
  add(listener: (change: AgentChange) => void): () => void
  clear(): void
  during<T>(work: () => Promise<T>): Promise<T>
}

function report(error: unknown): void {
  if (typeof reportError === 'function') reportError(error)
  else
    setTimeout(() => {
      throw error
    })
}

export function subscriber(graph: GraphCore): Changes {
  const listeners = new Set<(change: AgentChange) => void>()
  let offs: (() => void)[] = []
  let acting = 0
  let viewTimer: ReturnType<typeof setTimeout> | null = null
  let lastView: AgentChange | null = null

  const emit = (type: AgentChangeType, origin: AgentOrigin | undefined, detail?: unknown) => {
    const change: AgentChange = {
      type,
      ...(origin !== undefined ? { origin } : acting > 0 ? { origin: 'agent' as const } : {}),
      time: Date.now(),
      ...(detail !== undefined ? { detail } : {}),
    }
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue
      try {
        listener(change)
      } catch (error) {
        report(error)
      }
    }
  }

  const attach = () => {
    offs = [
      graph.on('selectionchange', ({ selection }) =>
        emit('selection', undefined, {
          nodes: selection.nodes.length,
          edges: selection.edges.length,
          ...(selection.shapes?.length ? { shapes: selection.shapes.length } : {}),
        }),
      ),
      graph.on('viewchange', ({ view, origin }) => {
        lastView = {
          type: 'view',
          origin,
          time: Date.now(),
          detail: { zoom: rounded(view.zoom, 4), center: [rounded(view.x, 2), rounded(view.y, 2)] },
        }
        if (viewTimer !== null) clearTimeout(viewTimer)
        viewTimer = setTimeout(() => {
          viewTimer = null
          const change = lastView
          lastView = null
          if (change) emit('view', change.origin, change.detail)
        }, viewQuiet)
      }),
      graph.on('foldchange', ({ folded }) =>
        emit('fold', undefined, { folded: folded.length, keys: folded.slice(0, 10).map(readKey) }),
      ),
      graph.on('layerchange', ({ hiddenLayers }) =>
        emit('layers', undefined, { hidden: [...hiddenLayers] }),
      ),
      graph.on('timechange', ({ time }) =>
        emit(
          'time',
          undefined,
          time ? { start: timeOut(time.start), end: timeOut(time.end) } : null,
        ),
      ),
      graph.on('positionchange', ({ origin, positions }) =>
        emit('positions', origin, { count: positions.size }),
      ),
      graph.on('layoutend', ({ name, completed }) =>
        emit('layout', acting > 0 ? 'agent' : undefined, { name, completed }),
      ),
      graph.on('issueschange', ({ issues }) => emit('issues', undefined, { count: issues.length })),
    ]
  }

  const detach = () => {
    for (const off of offs) off()
    offs = []
    if (viewTimer !== null) clearTimeout(viewTimer)
    viewTimer = null
    lastView = null
  }

  return {
    add(listener) {
      if (listeners.size === 0 && !graph.destroyed) attach()
      listeners.add(listener)
      return () => {
        if (!listeners.delete(listener)) return
        if (listeners.size === 0) detach()
      }
    },
    clear() {
      listeners.clear()
      detach()
    },
    async during(work) {
      acting++
      try {
        return await work()
      } finally {
        acting--
      }
    },
  }
}
