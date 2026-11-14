import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { type GlobeCamera, globeScreen } from '../core/globe'
import { defineGraph } from '../define-graph'
import type { GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { globeCamera } from '../testing/globe'
import { type FakeMap, fakeMap, globeInput } from '../testing/map'
import type { GraphDefinition, Point, ShapeGeometry } from '../types'
import { createShapeEditor, type ShapeEditor } from './editor'
import type { ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly node?: string
  readonly label?: string
}

interface Place {
  readonly id: string
  readonly lng: number
  readonly lat: number
}

const places: Place[] = [{ id: 'p', lng: 14, lat: 58 }]

const pins: Zone[] = [
  { id: 'rect', node: 'p', label: 'hi', geometry: { x: -2, y: -1.5, width: 4, height: 3 } },
  { id: 'disc', node: 'p', geometry: { center: { x: 0, y: 7 }, radius: 1.5 } },
]

const areas: Zone[] = [
  {
    id: 'area',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-12, 52],
          [-6, 52],
          [-9, 56],
          [-12, 52],
        ],
      ],
    },
  },
]

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

interface Setup {
  readonly map: FakeMap
  readonly graph: GraphInstance
  readonly editor: ShapeEditor
  readonly shot: GlobeCamera
  readonly batches: ShapeEdit[][]
  render(): void
}

function setup(mix = 1): Setup {
  const map = fakeMap()
  const graph = mountMapGraph(map.map, {
    definition: defineGraph({
      marks: [
        shapes(areas, { name: 'areas' }),
        shapes(pins, { name: 'pins', node: 'node', label: 'label' }),
        nodes(places, { longitude: 'lng', latitude: 'lat' }),
      ],
      layout: null,
    }) as GraphDefinition,
    ariaLabel: 'map',
  })
  const { camera } = map
  const render = () => {
    map.render(globeInput(camera.lng, camera.lat, camera.zoom, mix))
    dom.flushFrames()
  }
  render()
  const editor = createShapeEditor(graph)
  mountShapeEditor(editor)
  const batches: ShapeEdit[][] = []
  editor.on('edit', ({ edits }) => {
    batches.push([...edits])
  })
  const shot = globeCamera({
    longitude: camera.lng,
    latitude: camera.lat,
    zoom: camera.zoom,
    width: 800,
    height: 600,
    mix,
  })
  return { map, graph, editor, shot, batches, render }
}

const worldTurn = (2 * Math.PI) / 512

function gpuRound(shot: GlobeCamera, center: Point): { x: number; y: number; scale: number } {
  const at = { x: 0, y: 0 }
  globeScreen(shot, center.x, center.y, at)
  const e = Math.exp(Math.min(30, Math.max(-30, Math.PI - center.y * worldTurn)))
  const ring = 2 / (e + 1 / e)
  const zoom = shot.view.zoom
  return { x: at.x, y: at.y, scale: zoom + (shot.scale * ring - zoom) * shot.mix }
}

function numbers(path: string): number[] {
  return (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

function layerPath(graph: GraphInstance, index: number): string {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return layer?.children[index]?.getAttribute('d') ?? ''
}

function corners(path: string): Point[] {
  const values = numbers(path)
  const points: Point[] = []
  for (let k = 0; k + 1 < values.length; k += 2) {
    points.push({ x: values[k] ?? 0, y: values[k + 1] ?? 0 })
  }
  return points
}

function squareCenters(path: string, size = 8): Point[] {
  return [...path.matchAll(/M(-?[\d.]+) (-?[\d.]+)h/g)].map((match) => ({
    x: Number(match[1]) + size / 2,
    y: Number(match[2]) + size / 2,
  }))
}

function rectOnScreen(shot: GlobeCamera, node: Point, rect: number[]): number[] {
  const [x = 0, y = 0, width = 0, height = 0] = rect
  const place = gpuRound(shot, { x: node.x + x + width / 2, y: node.y + y + height / 2 })
  const halfWidth = (width / 2) * place.scale
  const halfHeight = (height / 2) * place.scale
  return [
    place.x - halfWidth,
    place.y - halfHeight,
    place.x + halfWidth,
    place.y + halfHeight,
    place.scale,
  ]
}

function send(map: FakeMap, type: string, point: Point): void {
  const init = { clientX: point.x, clientY: point.y, pointerId: 1, button: 0 }
  map.canvas.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true }))
}

describe.each([
  ['the globe', 1],
  ['the move from the globe to the flat map', 0.5],
])('the shape editor on %s', (_, mix) => {
  it('frames a pinned rectangle where the graph draws it, facing the screen', () => {
    const { graph, shot, render } = setup(mix)
    const node = graph.positions.get('p') as Point
    expect(graph.view.toScreen(node).x).toBeCloseTo(gpuRound(shot, node).x, 6)
    graph.selection.set({ nodes: [], edges: [], shapes: ['rect'] })
    render()
    const [left = 0, top = 0, right = 0, bottom = 0] = rectOnScreen(shot, node, [-2, -1.5, 4, 3])
    const box = corners(layerPath(graph, 1))
    expect(box).toHaveLength(4)
    const expected = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]
    box.forEach((corner, index) => {
      expect(corner.x).toBeCloseTo(expected[index]?.x ?? 0, 0)
      expect(corner.y).toBeCloseTo(expected[index]?.y ?? 0, 0)
    })
    const handles = squareCenters(layerPath(graph, 3))
    expect(handles).toHaveLength(8)
    expect(handles[0]?.x).toBeCloseTo(left, 0)
    expect(handles[4]?.y).toBeCloseTo(bottom, 0)
    graph.destroy()
  })

  it('keeps the dragged corner under the pointer, and proposes the size it shows', () => {
    const { map, graph, shot, render, batches } = setup(mix)
    const node = graph.positions.get('p') as Point
    graph.selection.set({ nodes: [], edges: [], shapes: ['rect'] })
    render()
    const [, , right = 0, bottom = 0, scale = 1] = rectOnScreen(shot, node, [-2, -1.5, 4, 3])
    const from = { x: right, y: bottom }
    const to = { x: right + 24, y: bottom + 12 }
    send(map, 'pointermove', from)
    send(map, 'pointerdown', from)
    send(map, 'pointermove', { x: right + 12, y: bottom + 6 })
    send(map, 'pointermove', to)
    render()
    const handles = squareCenters(layerPath(graph, 3))
    expect(handles[4]?.x).toBeCloseTo(to.x, 0)
    expect(handles[4]?.y).toBeCloseTo(to.y, 0)
    send(map, 'pointerup', to)
    render()
    const edit = batches.at(-1)?.[0]
    const geometry = (edit?.type === 'change' ? edit.geometry : null) as {
      readonly width: number
      readonly height: number
    } | null
    expect(geometry?.width).toBeCloseTo(4 + 24 / scale, 1)
    expect(geometry?.height).toBeCloseTo(3 + 12 / scale, 1)
    graph.destroy()
  })

  it('draws a pinned circle being moved as the graph draws it', () => {
    const { map, graph, shot, render, batches } = setup(mix)
    const node = graph.positions.get('p') as Point
    graph.selection.set({ nodes: [], edges: [], shapes: ['disc'] })
    render()
    const start = gpuRound(shot, { x: node.x, y: node.y + 7 })
    send(map, 'pointermove', start)
    send(map, 'pointerdown', start)
    send(map, 'pointermove', { x: start.x + 6, y: start.y + 3 })
    send(map, 'pointermove', { x: start.x + 12, y: start.y + 6 })
    send(map, 'pointerup', { x: start.x + 12, y: start.y + 6 })
    render()
    const edit = batches.at(-1)?.[0]
    const geometry = (edit?.type === 'change' ? edit.geometry : null) as {
      readonly center: Point
      readonly radius: number
    } | null
    expect(geometry).not.toBeNull()
    const center = geometry?.center ?? { x: 0, y: 0 }
    const place = gpuRound(shot, { x: node.x + center.x, y: node.y + center.y })
    const preview = graph.element.querySelector('svg[data-shape-editor] g > path')
    const ring = corners(preview?.getAttribute('d') ?? '')
    expect(ring.length).toBeGreaterThan(16)
    for (const point of ring) {
      expect(Math.hypot(point.x - place.x, point.y - place.y)).toBeCloseTo(1.5 * place.scale, 0)
    }
    graph.destroy()
  })

  it('opens the text of a pinned rectangle on the box the graph draws', () => {
    const { graph, editor, shot, render } = setup(mix)
    const node = graph.positions.get('p') as Point
    editor.editText('rect')
    render()
    const [left = 0, top = 0, right = 0, bottom = 0] = rectOnScreen(shot, node, [-2, -1.5, 4, 3])
    const text = editor.store.state.text
    expect(text?.x).toBeCloseTo(left, 6)
    expect(text?.y).toBeCloseTo(top, 6)
    expect(text?.width).toBeCloseTo(right - left, 6)
    expect(text?.height).toBeCloseTo(bottom - top, 6)
    graph.destroy()
  })

  it('keeps the vertices of a shape in degrees on the globe', () => {
    const { graph, shot, render } = setup(mix)
    graph.selection.set({ nodes: [], edges: [], shapes: ['area'] })
    render()
    const handles = squareCenters(layerPath(graph, 3))
    const expected = [
      [-12, 52],
      [-6, 52],
      [-9, 56],
    ].map(([longitude = 0, latitude = 0]) => {
      const at = { x: 0, y: 0 }
      const world = geoToWorld({ longitude, latitude })
      globeScreen(shot, world.x, world.y, at)
      return at
    })
    for (const point of expected) {
      expect(
        handles.some((handle) => Math.hypot(handle.x - point.x, handle.y - point.y) < 0.2),
      ).toBe(true)
    }
    graph.destroy()
  })
})
