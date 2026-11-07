import type { LayerFilter } from './mark-layers'
import type { HideFilter } from './state-buffers'
import type { TimeFilter, TimeSpans } from './time-range'
import type { ZoomRanges } from './zoom-range'

export interface Sight {
  readonly zoom: number
  readonly time: TimeFilter | null
  readonly layers: LayerFilter | null
  readonly hide: HideFilter | null
}

interface Shown {
  readonly zoom: ZoomRanges
  readonly time: TimeSpans
  readonly slot: Uint16Array
}

interface ShownEdges extends Shown {
  readonly source: Uint32Array
  readonly target: Uint32Array
}

export function sightOf(
  zoom: number,
  time: TimeFilter | null = null,
  layers: LayerFilter | null = null,
  hide: HideFilter | null = null,
): Sight {
  return { zoom, time, layers, hide }
}

export function filtered(columns: Shown, sight: Sight): boolean {
  return (
    columns.zoom.count > 0 ||
    (sight.time !== null && columns.time.count > 0) ||
    sight.layers !== null ||
    sight.hide !== null
  )
}

function ownShown(columns: Shown, index: number, sight: Sight): boolean {
  return columns.zoom.shown(index, sight.zoom) && columns.time.shown(index, sight.time)
}

function ownOpacity(columns: Shown, index: number, sight: Sight): number {
  const zoom = columns.zoom.opacity(index, sight.zoom)
  return zoom > 0 ? zoom * columns.time.opacity(index, sight.time) : 0
}

function layerHidden(flags: Uint8Array | undefined, columns: Shown, index: number): boolean {
  return flags !== undefined && flags[columns.slot[index] ?? 0] === 1
}

function nodeHidden(nodes: Shown, index: number, sight: Sight): boolean {
  const hide = sight.hide
  return (
    layerHidden(sight.layers?.nodes, nodes, index) ||
    (hide !== null && ((hide.masks.nodeMask[index] ?? 0) & hide.nodes) !== 0)
  )
}

function edgeHidden(edges: Shown, index: number, sight: Sight): boolean {
  const hide = sight.hide
  return (
    layerHidden(sight.layers?.edges, edges, index) ||
    (hide !== null && ((hide.masks.edgeMask[index] ?? 0) & hide.edges) !== 0)
  )
}

export function nodeShown(nodes: Shown, index: number, sight: Sight): boolean {
  return !nodeHidden(nodes, index, sight) && ownShown(nodes, index, sight)
}

export function nodeOpacity(nodes: Shown, index: number, sight: Sight): number {
  return nodeHidden(nodes, index, sight) ? 0 : ownOpacity(nodes, index, sight)
}

export function edgeOwnShown(edges: Shown, index: number, sight: Sight): boolean {
  return !edgeHidden(edges, index, sight) && ownShown(edges, index, sight)
}

export function edgeShown(nodes: Shown, edges: ShownEdges, index: number, sight: Sight): boolean {
  return (
    edgeOwnShown(edges, index, sight) &&
    nodeShown(nodes, edges.source[index] ?? 0, sight) &&
    nodeShown(nodes, edges.target[index] ?? 0, sight)
  )
}

export function edgeOpacity(nodes: Shown, edges: ShownEdges, index: number, sight: Sight): number {
  if (!filtered(nodes, sight) && !filtered(edges, sight)) return 1
  if (edgeHidden(edges, index, sight)) return 0
  return Math.min(
    ownOpacity(edges, index, sight),
    nodeOpacity(nodes, edges.source[index] ?? 0, sight),
    nodeOpacity(nodes, edges.target[index] ?? 0, sight),
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
  hash = mix(hash, sight.layers?.serial ?? 0)
  hash = mix(hash, sight.hide?.serial ?? 0)
  return hash >>> 0
}
