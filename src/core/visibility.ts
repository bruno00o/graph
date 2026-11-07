import type { TimeFilter, TimeSpans } from './time-range'
import type { ZoomRanges } from './zoom-range'

export interface Sight {
  readonly zoom: number
  readonly time: TimeFilter | null
}

interface Shown {
  readonly zoom: ZoomRanges
  readonly time: TimeSpans
}

interface ShownEdges extends Shown {
  readonly source: Uint32Array
  readonly target: Uint32Array
}

export function sightOf(zoom: number, time: TimeFilter | null = null): Sight {
  return { zoom, time }
}

export function filtered(columns: Shown, sight: Sight): boolean {
  return columns.zoom.count > 0 || (sight.time !== null && columns.time.count > 0)
}

export function ownShown(columns: Shown, index: number, sight: Sight): boolean {
  return columns.zoom.shown(index, sight.zoom) && columns.time.shown(index, sight.time)
}

export function ownOpacity(columns: Shown, index: number, sight: Sight): number {
  const zoom = columns.zoom.opacity(index, sight.zoom)
  return zoom > 0 ? zoom * columns.time.opacity(index, sight.time) : 0
}

export const nodeShown: (nodes: Shown, index: number, sight: Sight) => boolean = ownShown
export const nodeOpacity: (nodes: Shown, index: number, sight: Sight) => number = ownOpacity

export function edgeShown(nodes: Shown, edges: ShownEdges, index: number, sight: Sight): boolean {
  return (
    ownShown(edges, index, sight) &&
    ownShown(nodes, edges.source[index] ?? 0, sight) &&
    ownShown(nodes, edges.target[index] ?? 0, sight)
  )
}

export function edgeOpacity(nodes: Shown, edges: ShownEdges, index: number, sight: Sight): number {
  if (!filtered(nodes, sight) && !filtered(edges, sight)) return 1
  return Math.min(
    ownOpacity(edges, index, sight),
    ownOpacity(nodes, edges.source[index] ?? 0, sight),
    ownOpacity(nodes, edges.target[index] ?? 0, sight),
  )
}

function mix(hash: number, value: number): number {
  return Math.imul(hash ^ (value | 0), 0x01000193) ^ Math.floor(value / 4294967296)
}

export function detailStep(nodes: Shown, edges: Shown, sight: Sight): number {
  let hash = 0x811c9dc5
  hash = mix(hash, nodes.zoom.step(sight.zoom))
  hash = mix(hash, edges.zoom.step(sight.zoom))
  hash = mix(hash, nodes.time.step(sight.time))
  hash = mix(hash, edges.time.step(sight.time))
  return hash >>> 0
}
