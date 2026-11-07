import { describe, expect, it } from 'vitest'
import { TimeSpans, timeFilter } from './time-range'
import { detailStep, edgeOpacity, edgeShown, filtered, nodeShown, sightOf } from './visibility'
import { ZoomRanges, zoomFade } from './zoom-range'

function columns() {
  const nodes = { zoom: new ZoomRanges(), time: new TimeSpans() }
  const edges = {
    zoom: new ZoomRanges(),
    time: new TimeSpans(),
    source: Uint32Array.of(0),
    target: Uint32Array.of(1),
  }
  nodes.time.reserve(2)
  edges.time.reserve(1)
  return { nodes, edges }
}

describe('edges', () => {
  it('hides an edge while one of its ends is hidden by zoom', () => {
    const { nodes, edges } = columns()
    expect(edgeShown(nodes, edges, 0, sightOf(0.1))).toBe(true)
    expect(edgeOpacity(nodes, edges, 0, sightOf(0.1))).toBe(1)
    nodes.zoom.set(1, 1, Number.POSITIVE_INFINITY)
    expect(edgeShown(nodes, edges, 0, sightOf(0.5))).toBe(false)
    expect(edgeShown(nodes, edges, 0, sightOf(2))).toBe(true)
    expect(edgeOpacity(nodes, edges, 0, sightOf(2 ** (zoomFade / 2)))).toBeCloseTo(0.5)
    edges.zoom.set(0, 0, 1.5)
    expect(edgeShown(nodes, edges, 0, sightOf(2))).toBe(false)
    expect(detailStep(nodes, edges, sightOf(2))).not.toBe(detailStep(nodes, edges, sightOf(1.2)))
  })

  it('hides an edge while it or one of its ends is out of the time window', () => {
    const { nodes, edges } = columns()
    nodes.time.write(0, [0, 100])
    edges.time.write(0, [50, 60])
    const at = (start: number, end: number) => sightOf(1, timeFilter({ start, end }, 0))
    expect(filtered(edges, at(0, 1))).toBe(true)
    expect(filtered(edges, sightOf(1))).toBe(false)
    expect(nodeShown(nodes, 1, at(500, 600))).toBe(true)
    expect(edgeShown(nodes, edges, 0, at(55, 56))).toBe(true)
    expect(edgeShown(nodes, edges, 0, at(10, 20))).toBe(false)
    nodes.time.write(1, [58, 80])
    expect(edgeShown(nodes, edges, 0, at(55, 56))).toBe(false)
    expect(edgeShown(nodes, edges, 0, at(58, 59))).toBe(true)
    expect(detailStep(nodes, edges, at(55, 56))).not.toBe(detailStep(nodes, edges, at(58, 59)))
    expect(detailStep(nodes, edges, at(58.5, 59))).toBe(detailStep(nodes, edges, at(59, 59.5)))
  })

  it('takes the faintest of the edge and its ends', () => {
    const { nodes, edges } = columns()
    nodes.time.write(0, [0, 100])
    edges.time.write(0, [0, 100])
    const sight = sightOf(1, timeFilter({ start: 90, end: 95 }, 20))
    expect(edgeOpacity(nodes, edges, 0, sight)).toBeCloseTo(0.5)
  })
})
