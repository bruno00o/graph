import { withoutUndefined } from '../../core/without-undefined'
import type { Key, KeyList, Layout, LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import { inBlocks } from '../blocks'
import { endWith, failWith, instantRun, registerScopeRun } from '../scope-runs'
import { enableScopes } from '../scopes'
import { type ChainsPlan, compute, planOf } from './place'

/** Options of `chains`. */
export interface ChainsOptions<T = unknown> {
  /**
   * The exits the chains run between: a function of the node item and key, or a list of keys.
   * Keys of missing nodes are skipped.
   */
  readonly exits: ((datum: T, key: Key) => boolean) | KeyList<Key>
  /**
   * Gap between two nodes of a chain, from their borders, in world units. Defaults to the
   * largest diameter, blocks aside, and at least 24.
   */
  readonly spacing?: number | undefined
  /**
   * Layout of the heart, the exits linked to each other: it runs on those exits alone, the other
   * nodes left out. Without it, fixed exits keep their place and the other heart exits sit on a
   * circle around them, or around the unit when none is fixed.
   */
  readonly core?: Layout | undefined
}

/**
 * A layout that draws the chains between the exits as arcs of circles through their two exits,
 * the branches fanning out, and the units in rows. It ends at once, and nodes glide to their
 * place.
 */
export function chains<T = unknown>(options: ChainsOptions<T>): Layout<T> {
  enableScopes()
  const place = (graph: LayoutGraph<T>, plan: ChainsPlan, coreXy?: Float32Array): Float32Array =>
    inBlocks(graph, (scope) =>
      compute(
        scope,
        scope === graph ? plan : planOf(scope, options),
        scope === graph ? coreXy : undefined,
      ),
    )
  const layout: Layout<T> = Object.freeze({
    name: 'chains',
    options: Object.freeze(withoutUndefined(options)),
    incremental: false,
    turns: 'none',
    start(graph: LayoutGraph<T>, listener: LayoutListener): LayoutRun {
      let stopped = false
      let coreRun: LayoutRun | null = null
      queueMicrotask(() => {
        if (stopped) return
        let plan: ChainsPlan
        try {
          plan = planOf(graph, options)
        } catch (error) {
          failWith(listener, error, () => Float32Array.from(graph.xy))
          return
        }
        const core = options.core
        const movableHeart = plan.heart.filter((index) => graph.movable[index] === 1)
        if (core !== undefined && movableHeart.length >= 1 && plan.heart.length >= 2) {
          coreRun = core.start(heartGraph(graph, plan), {
            progress: (xy, progress) => {
              if (!stopped) listener.progress(xy, progress)
            },
            end: (coreXy) => {
              if (stopped) return
              endWith(graph, listener, () => place(graph, plan, coreXy))
            },
            fail: (error) => {
              if (stopped) return
              failWith(listener, error, () => Float32Array.from(graph.xy))
            },
          })
          return
        }
        endWith(graph, listener, () => place(graph, plan))
      })
      return {
        pin() {},
        stop() {
          stopped = true
          coreRun?.stop()
        },
      }
    },
  })
  registerScopeRun(layout, (graph, listener) =>
    instantRun(
      graph,
      () => place(graph as LayoutGraph<T>, planOf(graph as LayoutGraph<T>, options)),
      listener,
    ),
  )
  return layout
}

function heartGraph<T>(graph: LayoutGraph<T>, plan: ChainsPlan): LayoutGraph<T> {
  const alive = new Uint8Array(graph.capacity)
  for (const index of plan.heart) alive[index] = 1
  const ends: number[] = []
  const edges = graph.edges
  const edgeCount = Math.floor(edges.length / 2)
  for (let edge = 0; edge < edgeCount; edge++) {
    const a = edges[edge * 2] ?? -1
    const b = edges[edge * 2 + 1] ?? -1
    if (alive[a] === 1 && alive[b] === 1) {
      ends.push(a, b)
    }
  }
  return {
    capacity: graph.capacity,
    alive,
    movable: graph.movable,
    xy: Float32Array.from(graph.xy),
    radius: graph.radius,
    ...(graph.extents !== undefined ? { extents: graph.extents } : {}),
    edges: Uint32Array.from(ends),
    ...(graph.groups !== undefined ? { groups: graph.groups } : {}),
    ...(graph.blocks !== undefined ? { blocks: graph.blocks } : {}),
    keys: graph.keys,
    ...(graph.work !== undefined ? { work: graph.work } : {}),
    datum: graph.datum,
  }
}
