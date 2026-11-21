import { type Context, createContext, useContext, useLayoutEffect, useRef } from 'react'
import type { GraphInstance } from '../host/mount-graph'

export const GraphContext: Context<GraphInstance | null> = createContext<GraphInstance | null>(null)

export function useLatest<T>(value: T): { readonly current: T } {
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  })
  return latest
}

export function useGraphOf<G extends object>(
  given: G | null | undefined,
  caller: string,
): G | null {
  const around = useContext(GraphContext)
  if (given === null) return null
  const graph = given ?? around
  if (!graph) {
    throw new Error(`${caller}: pass a graph, or use it inside <Graph> or <MapGraph>`)
  }
  return graph as G
}
