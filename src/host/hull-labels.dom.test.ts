import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportSvg } from '../export'
import { hull } from '../hulls'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderInput } from './renderer'

vi.mock('@mapbox/tiny-sdf', () => ({
  default: class {
    draw() {
      return {
        data: new Uint8ClampedArray(30 * 34),
        width: 30,
        height: 34,
        glyphWidth: 24,
        glyphHeight: 28,
        glyphTop: 20,
        glyphLeft: 0,
        glyphAdvance: 12,
      }
    }
  },
}))

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly team: string
  readonly at: number
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0, team: 'red', at: 10 },
  { id: 'b', x: 80, y: 0, team: 'red', at: 10 },
  { id: 'c', x: 400, y: 0, team: 'blue', at: 1000 },
  { id: 'd', x: 480, y: 0, team: 'blue', at: 1000 },
]

let dom: FakeDom
let graph: GraphInstance | null = null
const inputs: RenderInput[] = []

beforeEach(() => {
  dom = installDom()
  inputs.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => null) as unknown as HTMLCanvasElement['getContext'],
  )
})

afterEach(() => {
  graph?.destroy()
  graph = null
  vi.restoreAllMocks()
  dom.restore()
})

function mount(minZoom: number | null = null) {
  const container = document.createElement('div')
  document.body.append(container)
  const red = nodes(
    items.filter((item) => item.team === 'red'),
    { name: 'red', layer: 'red', x: 'x', y: 'y', time: 'at', minZoom },
  )
  const blue = nodes(
    items.filter((item) => item.team === 'blue'),
    { name: 'blue', layer: 'blue', x: 'x', y: 'y', time: 'at' },
  )
  const created = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [red, blue],
        states: { gone: { hide: true } },
        hulls: [
          hull({ nodes: red, label: 'Reds' }),
          hull({ nodes: blue, label: { text: 'Blues', background: true } }),
        ],
        layout: null,
      }),
      ariaLabel: 'graph',
    },
    () => ({
      ...fakeRenderer(),
      sync: (input) => {
        inputs.push(input)
      },
    }),
  )
  dom.flushFrames()
  graph = created
  return created
}

const named = (svg: string) => ['Reds', 'Blues'].filter((name) => svg.includes(`>${name}<`))

describe('hull labels in the host', () => {
  it('hands the labelled hulls to the renderer and exports their names', async () => {
    const shown = mount()
    const hulls = inputs.at(-1)?.hulls
    expect(hulls?.shapes?.map((shape) => shape.label?.text)).toEqual(['Reds', 'Blues'])
    expect(hulls?.labelVersion).toBeGreaterThan(0)
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Reds', 'Blues'])
  })

  it('hides a label with its hull: layers, time window, hidden states and zoom ranges', async () => {
    const shown = mount(2)
    shown.view.set({ x: 240, y: 0, zoom: 4 })
    dom.flushFrames()
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Reds', 'Blues'])
    shown.layers.hide(['blue'])
    dom.flushFrames()
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Reds'])
    shown.layers.show(['blue'])
    shown.time.set({ start: 0, end: 100 })
    dom.flushFrames()
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Reds'])
    shown.time.set(null)
    shown.states.set('gone', { nodes: ['a', 'b'] })
    dom.flushFrames()
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Blues'])
    shown.states.clear('gone')
    shown.view.set({ x: 240, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(named(await exportSvg(shown, { region: 'graph' }))).toEqual(['Blues'])
  })

  it('hides the label of a hull whose nodes fold into their group', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const members = nodes(
      [
        { id: 'g', x: 0, y: 0 },
        { id: 'a', x: 0, y: 0, parent: 'g' },
        { id: 'b', x: 60, y: 0, parent: 'g' },
      ],
      { x: 'x', y: 'y', parent: 'parent' },
    )
    graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [members],
          hulls: [hull({ nodes: ['a', 'b'], label: 'Members' })],
          layout: null,
        }),
        ariaLabel: 'graph',
      },
      fakeRenderer,
    )
    dom.flushFrames()
    expect(await exportSvg(graph, { region: 'graph' })).toContain('>Members<')
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(await exportSvg(graph, { region: 'graph' })).not.toContain('>Members<')
  })
})
