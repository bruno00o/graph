import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { raw } from '../core/raw'
import { defineGraph } from '../define-graph'
import { attributeOf, parseXml, type XmlElement } from '../formats/xml'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { mockCanvasColors } from '../testing/canvas-colors'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinitionOptions, Key } from '../types'
import { exportDrawio } from '.'

interface Person {
  readonly id: Key
  readonly x: number
  readonly y: number
  readonly name?: string
  readonly team?: string
  readonly shape?: 'circle' | 'square' | 'diamond' | 'box'
  readonly parent?: string
  readonly year?: number
  readonly image?: string
}

interface Link {
  readonly id: Key
  readonly from: Key
  readonly to: Key
  readonly label?: string
  readonly dash?: 'solid' | 'dashed' | 'dotted'
  readonly way?: readonly { readonly x: number; readonly y: number }[]
}

let dom: FakeDom
let mounted: GraphInstance | null = null

beforeEach(() => {
  dom = installDom()
  mockCanvasColors()
})

afterEach(() => {
  mounted?.destroy()
  mounted = null
  vi.restoreAllMocks()
  dom.restore()
})

function mount(options: GraphDefinitionOptions, ariaLabel = 'People'): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const created = createGraphHost(
    container,
    { definition: defineGraph({ layout: null, ...options }), ariaLabel },
    fakeRenderer,
  )
  dom.flushFrames()
  mounted = created
  return created
}

interface Cell {
  readonly id: string
  readonly value: string
  readonly parent: string
  readonly style: Map<string, string>
  readonly element: XmlElement
}

function read(file: string): { model: XmlElement; cells: Cell[] } {
  const root = parseXml('graphml', file)
  const model = root.children[0]?.children[0]
  if (root.name !== 'mxfile' || model?.name !== 'mxGraphModel') throw new Error('not a diagram')
  const cells: Cell[] = []
  for (const element of model.children[0]?.children ?? []) {
    const style = new Map<string, string>()
    for (const part of (attributeOf(element, 'style') ?? '').split(';')) {
      if (!part) continue
      const at = part.indexOf('=')
      style.set(at < 0 ? part : part.slice(0, at), at < 0 ? '' : part.slice(at + 1))
    }
    cells.push({
      id: attributeOf(element, 'id') ?? '',
      value: attributeOf(element, 'value') ?? '',
      parent: attributeOf(element, 'parent') ?? '',
      style,
      element,
    })
  }
  return { model, cells }
}

function cellOf(cells: readonly Cell[], id: string): Cell {
  const cell = cells.find((candidate) => candidate.id === id)
  if (!cell) throw new Error(`no cell ${id}`)
  return cell
}

function box(cell: Cell): { x: number; y: number; width: number; height: number } {
  const geometry = cell.element.children.find((child) => child.name === 'mxGeometry')
  if (!geometry) throw new Error(`no geometry on ${cell.id}`)
  const value = (name: string) => Number(attributeOf(geometry, name) ?? 0)
  return { x: value('x'), y: value('y'), width: value('width'), height: value('height') }
}

function pointsOf(cell: Cell): { x: number; y: number }[] {
  const geometry = cell.element.children.find((child) => child.name === 'mxGeometry')
  const list = geometry?.children.find((child) => child.name === 'Array')
  return (list?.children ?? []).map((point) => ({
    x: Number(attributeOf(point, 'x')),
    y: Number(attributeOf(point, 'y')),
  }))
}

function center(cell: Cell): { x: number; y: number } {
  const { x, y, width, height } = box(cell)
  return { x: x + width / 2, y: y + height / 2 }
}

const people: Person[] = [
  { id: 'ada', x: 0, y: 0, name: 'Ada', shape: 'circle', team: '#2a6fdb' },
  { id: 'bea', x: 200, y: 0, name: 'Bea', shape: 'square', team: '#2fb344' },
  { id: 'cy', x: 100, y: 150, name: 'Cy', shape: 'diamond', team: '#d9480f' },
  { id: 'dot', x: 300, y: 150, name: 'Dot', shape: 'box', team: '#7048e8' },
]

const links: Link[] = [
  { id: 'ab', from: 'ada', to: 'bea', label: 'wrote with' },
  { id: 'bc', from: 'bea', to: 'cy', dash: 'dashed' },
  { id: 'cd', from: 'cy', to: 'dot', dash: 'dotted' },
]

function sample(extra: Partial<GraphDefinitionOptions> = {}, list = links): GraphDefinitionOptions {
  return {
    marks: [
      edges(list, {
        source: 'from',
        target: 'to',
        label: 'label',
        dash: (link) => link.dash ?? 'solid',
        arrow: 'target',
        stroke: '#5c5f66',
        width: raw(() => 2),
        waypoints: (link) => link.way ?? null,
      }),
      nodes(people, {
        x: 'x',
        y: 'y',
        label: 'name',
        shape: (person) => person.shape ?? 'circle',
        size: 20,
        fill: (person) => person.team ?? '#888888',
        stroke: '#333333',
        strokeWidth: 2,
      }),
    ],
    ...extra,
  }
}

describe('exportDrawio', () => {
  it('writes one page whose edges are attached to their nodes', async () => {
    const { model, cells } = read(await exportDrawio(mount(sample())))
    expect(cells.slice(0, 2).map((cell) => cell.id)).toEqual(['0', '1'])
    const edge = cellOf(cells, 'e:ab')
    expect(attributeOf(edge.element, 'edge')).toBe('1')
    expect(attributeOf(edge.element, 'source')).toBe('n:ada')
    expect(attributeOf(edge.element, 'target')).toBe('n:bea')
    expect(edge.value).toBe('wrote with')
    for (const id of ['n:ada', 'n:bea', 'n:cy', 'n:dot']) {
      expect(attributeOf(cellOf(cells, id).element, 'vertex')).toBe('1')
    }
    const ada = center(cellOf(cells, 'n:ada'))
    const cy = center(cellOf(cells, 'n:cy'))
    expect(cy.x - ada.x).toBeCloseTo(100, 1)
    expect(cy.y - ada.y).toBeCloseTo(150, 1)
    expect(Number(attributeOf(model, 'pageWidth'))).toBeGreaterThan(300 + 2 * 32)
    expect(Number(attributeOf(model, 'pageHeight'))).toBeGreaterThan(150 + 2 * 32)
    expect(box(cellOf(cells, 'n:ada')).x).toBeGreaterThanOrEqual(32)
  })

  it('maps shapes, colors, widths, dashes and arrows', async () => {
    const { cells } = read(await exportDrawio(mount(sample())))
    const ada = cellOf(cells, 'n:ada')
    expect(ada.style.get('shape')).toBe('ellipse')
    expect(ada.style.get('fillColor')).toBe('#2a6fdb')
    expect(ada.style.get('strokeColor')).toBe('#333333')
    expect(ada.style.get('strokeWidth')).toBe('2')
    expect(ada.style.get('verticalLabelPosition')).toBe('bottom')
    expect(ada.style.get('fontFamily')).toBe('system-ui,sans-serif')
    expect(box(ada).width).toBeCloseTo(20, 2)
    const bea = cellOf(cells, 'n:bea')
    expect(bea.style.get('rounded')).toBe('0')
    expect(box(bea).width).toBeCloseTo(20 * 0.86, 1)
    const cy = cellOf(cells, 'n:cy')
    expect(cy.style.get('shape')).toBe('rhombus')
    expect(box(cy).width).toBeCloseTo(20 * 1.2, 1)
    const dot = cellOf(cells, 'n:dot')
    expect(dot.style.get('rounded')).toBe('1')
    expect(dot.style.get('absoluteArcSize')).toBe('1')
    expect(box(dot).height).toBeCloseTo(20, 1)
    expect(box(dot).width).toBeGreaterThan(20)
    const ab = cellOf(cells, 'e:ab')
    expect(ab.style.get('endArrow')).toBe('block')
    expect(ab.style.get('startArrow')).toBe('none')
    expect(ab.style.get('strokeColor')).toBe('#5c5f66')
    expect(ab.style.get('strokeWidth')).toBe('2')
    expect(ab.style.has('dashed')).toBe(false)
    expect(cellOf(cells, 'e:bc').style.get('dashPattern')).toBe('3 2')
    expect(cellOf(cells, 'e:cd').style.get('dashPattern')).toBe('1 2')
  })

  it('escapes keys and labels and keeps ids unique', async () => {
    const odd = 'a"b<c>&d\ne\u0001f;g%'
    const list: Person[] = [
      { id: odd, x: 0, y: 0, name: `${odd} "quoted" <tag> & more` },
      { id: 7, x: 100, y: 0, name: 'Number' },
      { id: '7', x: 200, y: 0, name: 'Text' },
      { id: 'tab\there', x: 300, y: 0, name: 'Line one\nline two' },
    ]
    const file = await exportDrawio(
      mount(
        {
          marks: [
            edges([{ id: odd, from: odd, to: 7 }], { source: 'from', target: 'to' }),
            nodes(list, { x: 'x', y: 'y', label: 'name' }),
          ],
        },
        'Title "with" <markup> & \u0002',
      ),
    )
    expect(file).not.toContain('\u0001')
    expect(file).not.toContain('\u0002')
    const { cells } = read(file)
    const ids = cells.map((cell) => cell.id)
    expect(new Set(ids).size).toBe(ids.length)
    const odds = cells.filter((cell) => cell.value.startsWith('a"b'))
    expect(odds).toHaveLength(1)
    const node = odds[0] as Cell
    expect(node.value).toBe('a"b<c>&d\nef;g% "quoted" <tag> & more')
    expect([...node.id].every((char) => char >= ' ')).toBe(true)
    expect(cellOf(cells, 'n#7').value).toBe('Number')
    expect(cellOf(cells, 'n:7').value).toBe('Text')
    const tab = cells.find((cell) => cell.value === 'Line one\nline two')
    expect(tab?.id).toBe('n:tab%09;here')
    const edge = cells.find((cell) => attributeOf(cell.element, 'edge') === '1')
    expect(attributeOf(edge?.element as XmlElement, 'source')).toBe(node.id)
    expect(attributeOf(edge?.element as XmlElement, 'target')).toBe('n#7')
    const diagram = parseXml('graphml', file).children[0] as XmlElement
    expect(attributeOf(diagram, 'name')).toBe('Title "with" <markup> & ')
  })

  it('leaves out what the graph hides', async () => {
    const dated: Person[] = [
      { id: 'old', x: 0, y: 0, year: 1990 },
      { id: 'new', x: 100, y: 0, year: 2020 },
      { id: 'kept', x: 50, y: 80 },
      { id: 'gone', x: 150, y: 80 },
      { id: 'side', x: 200, y: 80 },
    ]
    const graph = mount({
      marks: [
        edges(
          [
            { id: 'a', from: 'old', to: 'kept' },
            { id: 'b', from: 'new', to: 'kept' },
            { id: 'c', from: 'kept', to: 'gone' },
          ],
          { source: 'from', target: 'to' },
        ),
        nodes(
          dated.filter((person) => person.id !== 'side'),
          {
            x: 'x',
            y: 'y',
            time: (person) => (person.year ? new Date(person.year, 0, 1) : null),
          },
        ),
        nodes(
          dated.filter((person) => person.id === 'side'),
          { name: 'extra', x: 'x', y: 'y', layer: 'extra' },
        ),
      ],
      states: { off: { hide: true } },
    })
    graph.time.set({ start: new Date(2000, 0, 1), end: null })
    graph.layers.hide(['extra'])
    graph.states.set('off', { nodes: ['gone'] })
    dom.flushFrames()
    const ids = read(await exportDrawio(graph)).cells.map((cell) => cell.id)
    expect(ids).toEqual(expect.arrayContaining(['n:new', 'n:kept', 'e:b']))
    for (const id of ['n:old', 'e:a', 'n:gone', 'e:c', 'n:side']) expect(ids).not.toContain(id)
    const all = read(await exportDrawio(graph, { window: null })).cells.map((cell) => cell.id)
    expect(all).toEqual(expect.arrayContaining(['n:old', 'e:a']))
  })

  it('keeps the states the definition adds and leaves out selection and hover', async () => {
    const graph = mount(sample({ states: { marked: { fill: '#ffd43b', strokeWidth: 4 } } }))
    graph.selection.set({ nodes: ['ada'] })
    graph.states.set('marked', { nodes: ['bea'] })
    dom.flushFrames()
    const plain = read(await exportDrawio(graph)).cells
    expect(cellOf(plain, 'n:ada').style.get('strokeWidth')).toBe('2')
    expect(cellOf(plain, 'n:bea').style.get('fillColor')).toBe('#ffd43b')
    expect(cellOf(plain, 'n:bea').style.get('strokeWidth')).toBe('4')
    const all = read(await exportDrawio(graph, { states: 'all' })).cells
    expect(cellOf(all, 'n:ada').style.get('strokeColor')).not.toBe('#333333')
    const none = read(await exportDrawio(graph, { states: 'none' })).cells
    expect(cellOf(none, 'n:bea').style.get('fillColor')).toBe('#2fb344')
    await expect(
      exportDrawio(graph, { states: 'some' as unknown as 'all' }),
    ).rejects.toBeInstanceOf(TypeError)
  })

  it('writes unfolded groups as containers holding their children', async () => {
    const members: Person[] = [
      { id: 'team', x: 0, y: 0, name: 'Team' },
      { id: 'in1', x: 100, y: 100, name: 'In one', parent: 'team' },
      { id: 'in2', x: 200, y: 140, name: 'In two', parent: 'team' },
      { id: 'out', x: 400, y: 0, name: 'Out' },
    ]
    const graph = mount({
      marks: [
        edges(
          [
            { id: 'inner', from: 'in1', to: 'in2' },
            { id: 'across', from: 'out', to: 'in1' },
          ],
          { source: 'from', target: 'to' },
        ),
        nodes(members, { x: 'x', y: 'y', label: 'name', parent: 'parent', size: 20 }),
      ],
    })
    const { cells } = read(await exportDrawio(graph))
    const team = cellOf(cells, 'n:team')
    expect(team.style.get('container')).toBe('1')
    expect(cells.indexOf(team)).toBeLessThan(cells.indexOf(cellOf(cells, 'n:in1')))
    const in1 = cellOf(cells, 'n:in1')
    expect(in1.parent).toBe('n:team')
    const inside = box(in1)
    const outer = box(team)
    expect(inside.x).toBeGreaterThan(0)
    expect(inside.x + inside.width).toBeLessThan(outer.width)
    expect(inside.y + inside.height).toBeLessThan(outer.height)
    expect(cellOf(cells, 'e:across').parent).toBe('1')
    expect(attributeOf(cellOf(cells, 'e:across').element, 'target')).toBe('n:in1')
    graph.groups.fold(['team'])
    dom.flushFrames()
    const folded = read(await exportDrawio(graph)).cells
    expect(cellOf(folded, 'n:team').style.has('container')).toBe(false)
    expect(folded.some((cell) => cell.id === 'n:in1')).toBe(false)
    const merged = folded.filter((cell) => attributeOf(cell.element, 'edge') === '1')
    expect(merged).toHaveLength(1)
    expect(attributeOf(merged[0]?.element as XmlElement, 'target')).toBe('n:team')
  })

  it('writes parallel edges as curves, loops and waypoints as points', async () => {
    const list: Link[] = [
      { id: 'one', from: 'ada', to: 'bea' },
      { id: 'two', from: 'ada', to: 'bea' },
      { id: 'loop', from: 'cy', to: 'cy' },
      {
        id: 'way',
        from: 'cy',
        to: 'dot',
        way: [
          { x: 100, y: 250 },
          { x: 200, y: 250 },
          { x: 300, y: 250 },
        ],
      },
    ]
    const { cells } = read(await exportDrawio(mount(sample({}, list))))
    for (const id of ['e:one', 'e:two']) {
      const cell = cellOf(cells, id)
      expect(cell.style.get('curved')).toBe('1')
      expect(pointsOf(cell)).toHaveLength(1)
    }
    const middle = center(cellOf(cells, 'n:ada')).y
    const one = pointsOf(cellOf(cells, 'e:one'))[0]?.y ?? middle
    const two = pointsOf(cellOf(cells, 'e:two'))[0]?.y ?? middle
    expect(Math.sign(one - middle) * Math.sign(two - middle)).toBe(-1)
    const loop = cellOf(cells, 'e:loop')
    expect(attributeOf(loop.element, 'source')).toBe('n:cy')
    expect(attributeOf(loop.element, 'target')).toBe('n:cy')
    expect(loop.style.get('curved')).toBe('1')
    expect(pointsOf(loop)).toHaveLength(2)
    const way = cellOf(cells, 'e:way')
    expect(way.style.has('curved')).toBe(false)
    const cy = center(cellOf(cells, 'n:cy'))
    expect(pointsOf(way).map((point) => [point.x - cy.x, point.y - cy.y])).toEqual([
      [0, 100],
      [200, 100],
    ])
  })

  it('picks the color of the longer end of a two-color edge', async () => {
    const graph = mount({
      marks: [
        edges(
          [
            { id: 'near', from: 'ada', to: 'bea' },
            { id: 'far', from: 'bea', to: 'cy' },
          ],
          {
            source: 'from',
            target: 'to',
            ends: {
              split: (link) => (link.id === 'near' ? 0.8 : 0.2),
              source: { stroke: '#2a6fdb', label: () => 'from' },
              target: { stroke: '#d9480f', label: () => 'to' },
            },
          },
        ),
        nodes(people, { x: 'x', y: 'y' }),
      ],
    })
    const { cells } = read(await exportDrawio(graph))
    expect(cellOf(cells, 'e:near').style.get('strokeColor')).toBe('#2a6fdb')
    expect(cellOf(cells, 'e:far').style.get('strokeColor')).toBe('#d9480f')
    const labels = cells.filter((cell) => cell.parent === 'e:near')
    expect(labels.map((cell) => cell.value).sort()).toEqual(['from', 'to'])
    expect(labels.every((cell) => cell.style.has('edgeLabel'))).toBe(true)
  })

  it('writes images as image shapes inside their node', async () => {
    const graph = mount({
      marks: [
        nodes([{ id: 'pic', x: 0, y: 0, image: 'data:image/png;base64,AAAA' }], {
          x: 'x',
          y: 'y',
          size: 40,
          image: (person) => person.image,
        }),
      ],
    })
    const { cells } = read(await exportDrawio(graph))
    const picture = cells.find((cell) => cell.style.get('shape') === 'image')
    expect(picture?.parent).toBe('n:pic')
    expect(picture?.style.get('image')).toBe('data:image/png,AAAA')
    expect(attributeOf(picture?.element as XmlElement, 'connectable')).toBe('0')
  })

  it('scales by zoom, fits a size and checks its numbers', async () => {
    const graph = mount(sample())
    const twice = read(await exportDrawio(graph, { zoom: 2 })).cells
    const ada = center(cellOf(twice, 'n:ada'))
    const cy = center(cellOf(twice, 'n:cy'))
    expect(cy.x - ada.x).toBeCloseTo(200, 1)
    expect(box(cellOf(twice, 'n:ada')).width).toBeCloseTo(40, 1)
    const sized = read(await exportDrawio(graph, { size: { width: 800, height: 600 } }))
    expect(attributeOf(sized.model, 'pageWidth')).toBe('800')
    expect(attributeOf(sized.model, 'pageHeight')).toBe('600')
    for (const cell of sized.cells) {
      if (attributeOf(cell.element, 'vertex') !== '1') continue
      const { x, y, width, height } = box(cell)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(x + width).toBeLessThanOrEqual(800)
      expect(y + height).toBeLessThanOrEqual(600)
    }
    const tight = read(await exportDrawio(graph, { padding: 0 })).cells
    expect(box(cellOf(tight, 'n:ada')).x).toBeLessThan(32)
    await expect(exportDrawio(graph, { zoom: 2, size: { width: 10 } })).rejects.toBeInstanceOf(
      RangeError,
    )
    await expect(exportDrawio(graph, { zoom: 0 })).rejects.toBeInstanceOf(RangeError)
    await expect(exportDrawio(graph, { padding: -1 })).rejects.toBeInstanceOf(RangeError)
    const clear = read(await exportDrawio(graph, { background: 'transparent' })).model
    expect(attributeOf(clear, 'background')).toBeUndefined()
  })

  it('takes the nodes the view shows with the view region', async () => {
    const graph = mount(sample())
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    const ids = read(await exportDrawio(graph, { region: 'view' })).cells.map((cell) => cell.id)
    expect(ids).toContain('n:ada')
    expect(ids).not.toContain('n:dot')
    expect(ids).not.toContain('e:cd')
  })
})
