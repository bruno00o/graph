import { type Context, createContext, useContext, useLayoutEffect, useRef } from 'react'
import type { GraphInstance } from '../host/mount-graph'
import type { Mark } from '../types'

export const GraphContext: Context<GraphInstance | null> = createContext<GraphInstance | null>(null)

export function useLatest<T>(value: T): { readonly current: T } {
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  })
  return latest
}

export function useGraphOf<S extends string, M extends Mark>(
  given: GraphInstance<S, M> | undefined,
  caller: string,
): GraphInstance<S, M> {
  const around = useContext(GraphContext)
  const graph = given ?? around
  if (!graph) {
    throw new Error(`${caller}: pass a graph, or use it inside <Graph> or <MapGraph>`)
  }
  return graph as unknown as GraphInstance<S, M>
}
