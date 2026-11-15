import type { NodeColumns } from '../core/columns'
import { compileNodeMark } from '../core/compile-mark'
import { type GlobeCamera, globeScale } from '../core/globe'
import type { GraphModel } from '../core/graph-model'
import type { PlacementUnit } from '../core/positions'

export interface PlacementSource {
  readonly nodes: NodeColumns
  readonly model: GraphModel
  zoom(): number
  globe(): GlobeCamera | null
}

function inScreenUnits(source: PlacementSource, index: number): boolean {
  if (source.nodes.alive[index] === 1) return source.nodes.screenUnits[index] === 1
  const record = source.model.nodeAt(index)
  return record !== undefined && compileNodeMark(record.mark).screenUnits
}

export function placementUnit(source: PlacementSource): PlacementUnit {
  return (index, y) => {
    if (!inScreenUnits(source, index)) return 1
    const zoom = source.zoom()
    const globe = source.globe()
    const pixels = globe ? (globeScale(globe, y) * zoom) / globe.view.zoom : zoom
    return pixels > 0 && Number.isFinite(pixels) ? 1 / pixels : 1
  }
}
