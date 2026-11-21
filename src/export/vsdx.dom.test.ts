import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { raw } from '../core/raw'
import { defineGraph } from '../define-graph'
import { attributeOf, parseXml, type XmlElement } from '../formats/xml'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { mockCanvasColors } from '../testing/canvas-colors'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinitionOptions, Key } from '../types'
import { exportVsdx } from '.'

interface Person {
  readonly id: Key
  readonly x: number
  readonly y: number
  readonly name?: string
  readonly shape?: 'circle' | 'square' | 'diamond' | 'box'
  readonly parent?: string
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
  vi.unstubAllGlobals()
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

function checksum(data: Uint8Array): number {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

interface Entry {
  readonly name: string
  readonly method: number
  readonly text: string
}

async function unzip(blob: Blob): Promise<Entry[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const entries: Entry[] = []
  const decoder = new TextDecoder()
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const packed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLength = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength))
    expect(view.getUint32(local, true)).toBe(0x04034b50)
    expect(view.getUint32(local + 14, true)).toBe(crc)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const body = bytes.subarray(start, start + packed)
    const data = method === 8 ? await inflate(body) : body
    expect(data.length).toBe(size)
    expect(checksum(data)).toBe(crc)
    entries.push({ name, method, text: decoder.decode(data) })
    at += 46 + nameLength + extra + comment
  }
  return entries
}

function part(entries: readonly Entry[], name: string): XmlElement {
  const entry = entries.find((candidate) => candidate.name === name)
  if (!entry) throw new Error(`no part ${name}`)
  return parseXml('graphml', entry.text)
}

function all(element: XmlElement, name: string): XmlElement[] {
  const found: XmlElement[] = []
  const visit = (current: XmlElement) => {
    if (current.name === name) found.push(current)
    for (const child of current.children) visit(child)
  }
  visit(element)
  return found
}

function own(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name)
}

function cellOf(shape: XmlElement, name: string): string | undefined {
  const found = own(shape, 'Cell').find((cell) => attributeOf(cell, 'N') === name)
  return found ? attributeOf(found, 'V') : undefined
}

function formulaOf(shape: XmlElement, name: string): string | undefined {
  const found = own(shape, 'Cell').find((cell) => attributeOf(cell, 'N') === name)
  return found ? attributeOf(found, 'F') : undefined
}

function numberOf(shape: XmlElement, name: string): number {
  return Number(cellOf(shape, name))
}

function keyOf(shape: XmlElement): string | undefined {
  const section = own(shape, 'Section').find((item) => attributeOf(item, 'N') === 'Property')
  const value = section ? all(section, 'Cell').find((c) => attributeOf(c, 'N') === 'Value') : null
  return value ? attributeOf(value, 'V') : undefined
}

function shapeByKey(page: XmlElement, key: string): XmlElement {
  const shape = all(page, 'Shape').find((candidate) => keyOf(candidate) === key)
  if (!shape) throw new Error(`no shape for ${key}`)
  return shape
}

function textOf(shape: XmlElement): string {
  return own(shape, 'Text')[0]?.text ?? ''
}

function geometryRows(shape: XmlElement): XmlElement[] {
  const section = own(shape, 'Section').find((item) => attributeOf(item, 'N') === 'Geometry')
  return section ? own(section, 'Row') : []
}

const people: Person[] = [
  { id: 'ada', x: 0, y: 0, name: 'Ada', shape: 'circle' },
  { id: 'bea', x: 192, y: 0, name: 'Bea', shape: 'square' },
  { id: 'cy', x: 96, y: 144, name: 'Cy', shape: 'diamond' },
  { id: 'dot', x: 288, y: 144, name: 'Dot', shape: 'box' },
]

function sample(list: readonly Link[], extra: Partial<GraphDefinitionOptions> = {}) {
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
        size: 24,
        fill: '#2a6fdb',
        stroke: '#333333',
        strokeWidth: 2,
      }),
    ],
    ...extra,
  }
}

const links: Link[] = [
  { id: 'ab', from: 'ada', to: 'bea', label: 'wrote with' },
  { id: 'bc', from: 'bea', to: 'cy', dash: 'dashed' },
  { id: 'cd', from: 'cy', to: 'dot', dash: 'dotted' },
]

describe('exportVsdx', () => {
  it('packs a Visio document whose parts point at each other', async () => {
    const blob = await exportVsdx(mount(sample(links)))
    expect(blob.type).toBe('application/vnd.ms-visio.drawing')
    const entries = await unzip(blob)
    expect(entries[0]?.name).toBe('[Content_Types].xml')
    expect(entries.every((entry) => entry.method === 8)).toBe(true)
    const types = part(entries, '[Content_Types].xml')
    const overrides = own(types, 'Override').map((item) => attributeOf(item, 'PartName'))
    for (const name of overrides) {
      expect(entries.some((entry) => `/${entry.name}` === name)).toBe(true)
    }
    const targets = (rels: string, base: string) =>
      own(part(entries, rels), 'Relationship').map((item) => base + attributeOf(item, 'Target'))
    for (const target of [
      ...targets('_rels/.rels', ''),
      ...targets('visio/_rels/document.xml.rels', 'visio/'),
      ...targets('visio/pages/_rels/pages.xml.rels', 'visio/pages/'),
    ]) {
      expect(entries.some((entry) => entry.name === target)).toBe(true)
    }
    const pages = part(entries, 'visio/pages/pages.xml')
    const sheet = all(pages, 'PageSheet')[0] as XmlElement
    expect(numberOf(sheet, 'PageWidth')).toBeGreaterThan((288 + 64) / 96)
    expect(attributeOf(all(pages, 'Page')[0] as XmlElement, 'Name')).toBe('People')
    const faces = all(part(entries, 'visio/document.xml'), 'FaceName').map((face) =>
      attributeOf(face, 'NameU'),
    )
    expect(faces).toContain('Calibri')
  })

  it('writes shapes in inches with y going up', async () => {
    const entries = await unzip(await exportVsdx(mount(sample(links))))
    const page = part(entries, 'visio/pages/page1.xml')
    const height = numberOf(
      all(part(entries, 'visio/pages/pages.xml'), 'PageSheet')[0] as XmlElement,
      'PageHeight',
    )
    const ada = shapeByKey(page, 'ada')
    const cy = shapeByKey(page, 'cy')
    expect(numberOf(cy, 'PinX') - numberOf(ada, 'PinX')).toBeCloseTo(1, 4)
    expect(numberOf(ada, 'PinY') - numberOf(cy, 'PinY')).toBeCloseTo(1.5, 4)
    expect(numberOf(ada, 'PinY')).toBeLessThan(height)
    expect(numberOf(ada, 'Width')).toBeCloseTo(24 / 96, 4)
    expect(attributeOf(geometryRows(ada)[0] as XmlElement, 'T')).toBe('Ellipse')
    expect(geometryRows(shapeByKey(page, 'bea')).map((row) => attributeOf(row, 'T'))).toEqual([
      'MoveTo',
      'LineTo',
      'LineTo',
      'LineTo',
      'LineTo',
    ])
    expect(numberOf(shapeByKey(page, 'cy'), 'Width')).toBeCloseTo((24 * 1.2) / 96, 4)
    expect(numberOf(shapeByKey(page, 'dot'), 'Rounding')).toBeGreaterThan(0)
    expect(cellOf(ada, 'FillForegnd')).toBe('#2a6fdb')
    expect(cellOf(ada, 'LineColor')).toBe('#333333')
    expect(numberOf(ada, 'LineWeight')).toBeCloseTo(2 / 96, 5)
    expect(textOf(ada)).toBe('Ada')
    expect(numberOf(ada, 'TxtPinY')).toBeLessThan(0)
    const character = all(ada, 'Section').find((item) => attributeOf(item, 'N') === 'Character')
    const font = all(character as XmlElement, 'Cell')
    const named = (name: string) =>
      attributeOf(font.find((c) => attributeOf(c, 'N') === name) as XmlElement, 'V')
    expect(named('Font')).toBe('Calibri')
    expect(Number(named('Size'))).toBeCloseTo(12 / 96, 4)
  })

  it('glues edges to their nodes', async () => {
    const entries = await unzip(await exportVsdx(mount(sample(links))))
    const page = part(entries, 'visio/pages/page1.xml')
    const ab = shapeByKey(page, 'ab')
    const ada = shapeByKey(page, 'ada')
    const bea = shapeByKey(page, 'bea')
    const connects = all(page, 'Connect').filter(
      (item) => attributeOf(item, 'FromSheet') === attributeOf(ab, 'ID'),
    )
    expect(
      connects.map((item) => [
        attributeOf(item, 'FromCell'),
        attributeOf(item, 'ToSheet'),
        attributeOf(item, 'ToPart'),
      ]),
    ).toEqual([
      ['BeginX', attributeOf(ada, 'ID'), '3'],
      ['EndX', attributeOf(bea, 'ID'), '3'],
    ])
    expect(formulaOf(ab, 'BeginX')).toContain('_WALKGLUE')
    expect(formulaOf(ab, 'BegTrigger')).toBe(
      `_XFTRIGGER(Sheet.${attributeOf(ada, 'ID')}!EventXFMod)`,
    )
    expect(numberOf(ab, 'BeginX')).toBeCloseTo(numberOf(ada, 'PinX') + 12 / 96, 4)
    expect(numberOf(ab, 'EndX')).toBeCloseTo(numberOf(bea, 'PinX') - (12 * 0.86) / 96, 4)
    expect(cellOf(ab, 'EndArrow')).toBe('13')
    expect(cellOf(ab, 'BeginArrow')).toBe('0')
    expect(textOf(ab)).toBe('wrote with')
    expect(cellOf(shapeByKey(page, 'bc'), 'LinePattern')).toBe('2')
    expect(cellOf(shapeByKey(page, 'cd'), 'LinePattern')).toBe('3')
  })

  it('keeps bends where they are and samples curves', async () => {
    const list: Link[] = [
      { id: 'one', from: 'ada', to: 'bea' },
      { id: 'two', from: 'ada', to: 'bea' },
      { id: 'loop', from: 'cy', to: 'cy' },
      {
        id: 'way',
        from: 'cy',
        to: 'dot',
        way: [
          { x: 96, y: 240 },
          { x: 288, y: 240 },
        ],
      },
    ]
    const entries = await unzip(await exportVsdx(mount(sample(list))))
    const page = part(entries, 'visio/pages/page1.xml')
    expect(geometryRows(shapeByKey(page, 'one')).length).toBeGreaterThan(5)
    expect(geometryRows(shapeByKey(page, 'loop')).length).toBeGreaterThan(5)
    const way = shapeByKey(page, 'way')
    const rows = geometryRows(way)
    expect(rows).toHaveLength(4)
    const cy = shapeByKey(page, 'cy')
    const bend = rows[1] as XmlElement
    const x = all(bend, 'Cell').find((c) => attributeOf(c, 'N') === 'X') as XmlElement
    expect(attributeOf(x, 'F')).toMatch(/^[\d.]+IN-BeginX$/)
    expect(Number(attributeOf(x, 'V')) + numberOf(way, 'BeginX')).toBeCloseTo(
      numberOf(cy, 'PinX'),
      4,
    )
    const last = all(rows[3] as XmlElement, 'Cell').map((c) => attributeOf(c, 'F'))
    expect(last).toEqual(['Width*1', 'Height*1'])
  })

  it('writes unfolded groups as Visio groups holding their members', async () => {
    const members: Person[] = [
      { id: 'team', x: 0, y: 0, name: 'Team' },
      { id: 'in1', x: 100, y: 100, name: 'In one', parent: 'team' },
      { id: 'in2', x: 200, y: 140, name: 'In two', parent: 'team' },
      { id: 'out', x: 400, y: 0, name: 'Out' },
    ]
    const graph = mount({
      marks: [
        edges([{ id: 'across', from: 'out', to: 'in1' }], { source: 'from', target: 'to' }),
        nodes(members, { x: 'x', y: 'y', label: 'name', parent: 'parent', size: 20 }),
      ],
    })
    const page = part(await unzip(await exportVsdx(graph)), 'visio/pages/page1.xml')
    const team = shapeByKey(page, 'team')
    expect(attributeOf(team, 'Type')).toBe('Group')
    expect(cellOf(team, 'DisplayMode')).toBe('1')
    const inside = own(own(team, 'Shapes')[0] as XmlElement, 'Shape').map(keyOf)
    expect(inside).toEqual(['in1', 'in2'])
    const in1 = shapeByKey(page, 'in1')
    expect(numberOf(in1, 'PinX')).toBeGreaterThan(0)
    expect(numberOf(in1, 'PinX')).toBeLessThan(numberOf(team, 'Width'))
    const across = shapeByKey(page, 'across')
    const glued = all(page, 'Connect').find(
      (item) =>
        attributeOf(item, 'FromSheet') === attributeOf(across, 'ID') &&
        attributeOf(item, 'FromCell') === 'EndX',
    )
    expect(attributeOf(glued as XmlElement, 'ToSheet')).toBe(attributeOf(in1, 'ID'))
  })

  it('escapes text and keys', async () => {
    const odd = 'a"b<c>&d'
    const graph = mount({
      marks: [
        nodes([{ id: odd, x: 0, y: 0, name: 'Line "one" <&>\nline two\u0001' }], {
          x: 'x',
          y: 'y',
          label: 'name',
        }),
      ],
    })
    const page = part(await unzip(await exportVsdx(graph)), 'visio/pages/page1.xml')
    const shape = shapeByKey(page, odd)
    expect(textOf(shape)).toBe('Line "one" <&>\nline two')
  })

  it('stores entries without CompressionStream and scales with the zoom', async () => {
    const graph = mount(sample(links))
    vi.stubGlobal('CompressionStream', undefined)
    const entries = await unzip(await exportVsdx(graph, { zoom: 2, background: 'transparent' }))
    expect(entries.every((entry) => entry.method === 0)).toBe(true)
    const page = part(entries, 'visio/pages/page1.xml')
    expect(numberOf(shapeByKey(page, 'ada'), 'Width')).toBeCloseTo(48 / 96, 4)
    expect(all(page, 'Shape').filter((shape) => keyOf(shape) === undefined)).toHaveLength(0)
    const sized = await unzip(await exportVsdx(graph, { size: { width: 960, height: 480 } }))
    const sheet = all(part(sized, 'visio/pages/pages.xml'), 'PageSheet')[0] as XmlElement
    expect(numberOf(sheet, 'PageWidth')).toBe(10)
    expect(numberOf(sheet, 'PageHeight')).toBe(5)
  })
})

interface Rule {
  readonly attributes: readonly string[]
  readonly required?: readonly string[]
  readonly slots?: readonly (readonly string[])[]
  readonly once?: readonly string[]
  readonly least?: readonly string[]
}

const sheetAttributes = ['LineStyle', 'FillStyle', 'TextStyle']
const sheetSlot = ['Cell', 'Trigger', 'Section']
const leaf: Rule = { attributes: [] }
const settings = [
  'GlueSettings',
  'SnapSettings',
  'SnapExtensions',
  'SnapAngles',
  'DynamicGridEnabled',
  'ProtectStyles',
  'ProtectShapes',
  'ProtectMasters',
  'ProtectBkgnds',
]

const rules: Readonly<Record<string, Rule>> = {
  VisioDocument: {
    attributes: ['space'],
    slots: [
      ['DocumentSettings'],
      ['Colors'],
      ['FaceNames'],
      ['StyleSheets'],
      ['DocumentSheet'],
      ['EventList'],
      ['HeaderFooter'],
      ['PublishSettings'],
    ],
    once: ['DocumentSettings', 'Colors', 'FaceNames', 'StyleSheets', 'DocumentSheet'],
  },
  DocumentSettings: {
    attributes: [
      'TopPage',
      'DefaultTextStyle',
      'DefaultLineStyle',
      'DefaultFillStyle',
      'DefaultGuideStyle',
    ],
    slots: settings.map((name) => [name]),
    once: settings,
  },
  ...Object.fromEntries(settings.map((name) => [name, leaf])),
  Colors: { attributes: [], slots: [['ColorEntry']], least: ['ColorEntry'] },
  ColorEntry: { attributes: ['IX', 'RGB'], required: ['IX', 'RGB'] },
  FaceNames: { attributes: [], slots: [['FaceName']], least: ['FaceName'] },
  FaceName: {
    attributes: ['NameU', 'UnicodeRanges', 'CharSets', 'Panos', 'Panose', 'Flags'],
    required: ['NameU'],
  },
  StyleSheets: { attributes: [], slots: [['StyleSheet']] },
  StyleSheet: {
    attributes: ['ID', 'Name', 'NameU', 'IsCustomName', 'IsCustomNameU', ...sheetAttributes],
    required: ['ID'],
    slots: [sheetSlot],
  },
  DocumentSheet: {
    attributes: ['Name', 'NameU', 'IsCustomName', 'IsCustomNameU', 'UniqueID', ...sheetAttributes],
    slots: [sheetSlot],
  },
  Section: {
    attributes: ['N', 'Del', 'IX'],
    required: ['N'],
    slots: [['Cell'], ['Trigger'], ['Row']],
  },
  Row: { attributes: ['N', 'LocalName', 'IX', 'T', 'Del'], slots: [['Cell'], ['Trigger']] },
  Cell: { attributes: ['N', 'U', 'E', 'F', 'V'], required: ['N'], slots: [['RefBy']] },
  Pages: { attributes: ['space'], slots: [['Page']] },
  Page: {
    attributes: [
      'ID',
      'Name',
      'NameU',
      'IsCustomName',
      'IsCustomNameU',
      'Background',
      'BackPage',
      'ViewScale',
      'ViewCenterX',
      'ViewCenterY',
      'ReviewerID',
      'AssociatedPage',
    ],
    required: ['ID'],
    slots: [['PageSheet'], ['Rel']],
    once: ['PageSheet', 'Rel'],
    least: ['Rel'],
  },
  PageSheet: { attributes: ['UniqueID', ...sheetAttributes], slots: [sheetSlot] },
  Rel: { attributes: ['id'], required: ['id'] },
  PageContents: {
    attributes: ['space'],
    slots: [['Shapes'], ['Connects']],
    once: ['Shapes', 'Connects'],
  },
  Shapes: { attributes: [], slots: [['Shape']] },
  Shape: {
    attributes: [
      'ID',
      'OriginalID',
      'Del',
      'MasterShape',
      'UniqueID',
      'Name',
      'NameU',
      'IsCustomName',
      'IsCustomNameU',
      'Master',
      'Type',
      ...sheetAttributes,
    ],
    required: ['ID'],
    slots: [sheetSlot, ['Text'], ['Data1'], ['Data2'], ['Data3'], ['ForeignData'], ['Shapes']],
    once: ['Text', 'Data1', 'Data2', 'Data3', 'ForeignData', 'Shapes'],
  },
  Text: { attributes: [], slots: [['cp', 'pp', 'tp', 'fld']] },
  cp: { attributes: ['IX'], required: ['IX'] },
  pp: { attributes: ['IX'], required: ['IX'] },
  Connects: { attributes: [], slots: [['Connect']] },
  Connect: {
    attributes: ['FromSheet', 'FromCell', 'FromPart', 'ToSheet', 'ToCell', 'ToPart'],
    required: ['FromSheet', 'ToSheet'],
  },
}

function breaches(element: XmlElement, path = element.name): string[] {
  const rule = rules[element.name]
  if (!rule) return [`${path}: unknown element`]
  const found: string[] = []
  const names = element.attributes.filter((_, index) => index % 2 === 0)
  for (const name of names) {
    if (!rule.attributes.includes(name)) found.push(`${path}: attribute ${name}`)
  }
  for (const name of rule.required ?? []) {
    if (!names.includes(name)) found.push(`${path}: missing ${name}`)
  }
  const slots = rule.slots ?? []
  let reached = 0
  for (const child of element.children) {
    const slot = slots.findIndex((allowed) => allowed.includes(child.name))
    if (slot < 0) found.push(`${path}: child ${child.name}`)
    else if (slot < reached) found.push(`${path}: ${child.name} out of order`)
    else reached = slot
  }
  for (const name of rule.once ?? []) {
    if (own(element, name).length > 1) found.push(`${path}: several ${name}`)
  }
  for (const name of rule.least ?? []) {
    if (own(element, name).length === 0) found.push(`${path}: no ${name}`)
  }
  for (const child of element.children) found.push(...breaches(child, `${path}/${child.name}`))
  return found
}

async function richEntries(): Promise<Entry[]> {
  const members: Person[] = [
    { id: 'team', x: 0, y: 0, name: 'Team' },
    { id: 'in1', x: 100, y: 100, name: 'In one', parent: 'team', shape: 'box' },
    { id: 'in2', x: 200, y: 140, name: 'In two', parent: 'team', shape: 'diamond' },
    { id: 'out', x: 400, y: 0, name: 'Out' },
  ]
  const list: Link[] = [
    { id: 'across', from: 'out', to: 'in1', label: 'across' },
    { id: 'one', from: 'in1', to: 'in2' },
    { id: 'two', from: 'in1', to: 'in2', dash: 'dashed' },
    { id: 'loop', from: 'out', to: 'out' },
    {
      id: 'way',
      from: 'in2',
      to: 'out',
      way: [
        { x: 200, y: 300 },
        { x: 400, y: 300 },
      ],
    },
  ]
  const graph = mount({
    marks: [
      edges(list, {
        source: 'from',
        target: 'to',
        label: { text: 'label', background: true },
        dash: (link) => link.dash ?? 'solid',
        arrow: 'both',
        waypoints: (link) => link.way ?? null,
        ends: {
          source: { label: (link) => `${link.from}` },
          target: { label: (link) => `${link.to}` },
        },
      }),
      nodes(members, {
        x: 'x',
        y: 'y',
        label: 'name',
        parent: 'parent',
        shape: (person) => person.shape ?? 'circle',
        size: 24,
      }),
    ],
  })
  return unzip(await exportVsdx(graph))
}

describe('exportVsdx against MS-VSDX', () => {
  it('writes Visio parts with the elements, attributes and order of the schema', async () => {
    const entries = await richEntries()
    const visio = entries.filter(
      (entry) => entry.name.startsWith('visio/') && !entry.name.includes('_rels'),
    )
    expect(visio.map((entry) => entry.name).sort()).toEqual([
      'visio/document.xml',
      'visio/pages/page1.xml',
      'visio/pages/pages.xml',
      'visio/theme/theme1.xml',
      'visio/windows.xml',
    ])
    for (const name of ['visio/document.xml', 'visio/pages/pages.xml', 'visio/pages/page1.xml']) {
      expect(breaches(part(entries, name))).toEqual([])
    }
  })

  it('opens a drawing window on the page and carries a theme', async () => {
    const entries = await richEntries()
    const overrides = new Map(
      own(part(entries, '[Content_Types].xml'), 'Override').map((item) => [
        attributeOf(item, 'PartName'),
        attributeOf(item, 'ContentType'),
      ]),
    )
    expect(overrides.get('/visio/windows.xml')).toBe('application/vnd.ms-visio.windows+xml')
    expect(overrides.get('/visio/theme/theme1.xml')).toBe(
      'application/vnd.openxmlformats-officedocument.theme+xml',
    )
    const relations = own(part(entries, 'visio/_rels/document.xml.rels'), 'Relationship').map(
      (item) => [attributeOf(item, 'Type'), attributeOf(item, 'Target')],
    )
    expect(relations).toContainEqual([
      'http://schemas.microsoft.com/visio/2010/relationships/windows',
      'windows.xml',
    ])
    expect(relations).toContainEqual([
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
      'theme/theme1.xml',
    ])
    const windows = own(part(entries, 'visio/windows.xml'), 'Window')
    expect(windows).toHaveLength(1)
    const window = windows[0] as XmlElement
    expect(attributeOf(window, 'WindowType')).toBe('Drawing')
    expect(attributeOf(window, 'ContainerType')).toBe('Page')
    expect(attributeOf(window, 'Page')).toBe('0')
    const theme = part(entries, 'visio/theme/theme1.xml')
    expect(theme.name).toBe('theme')
    expect((all(theme, 'clrScheme')[0] as XmlElement).children).toHaveLength(12)
    for (const list of ['fillStyleLst', 'lnStyleLst', 'effectStyleLst', 'bgFillStyleLst']) {
      expect((all(theme, list)[0] as XmlElement).children.length).toBeGreaterThanOrEqual(3)
    }
    expect(attributeOf(all(theme, 'latin')[0] as XmlElement, 'typeface')).toBe('Calibri')
  })

  it('keeps fonts, colors and formulas within what the format defines', async () => {
    const entries = await richEntries()
    const document = part(entries, 'visio/document.xml')
    const faces = all(document, 'FaceName').map((face) => attributeOf(face, 'NameU'))
    for (const entry of all(document, 'ColorEntry')) {
      expect(Number(attributeOf(entry, 'IX'))).toBeGreaterThan(23)
    }
    const page = part(entries, 'visio/pages/page1.xml')
    const cells = [...all(document, 'Cell'), ...all(page, 'Cell')]
    const fonts = cells.filter((cell) => attributeOf(cell, 'N') === 'Font')
    expect(fonts.length).toBeGreaterThan(0)
    for (const font of fonts) expect(faces).toContain(attributeOf(font, 'V'))
    const formulas = cells.flatMap((cell) => attributeOf(cell, 'F') ?? [])
    expect(formulas.some((formula) => formula.endsWith('IN-BeginX'))).toBe(true)
    for (const formula of formulas) expect(formula).not.toMatch(/\s/)
    for (const cell of cells) {
      const unit = attributeOf(cell, 'U')
      if (unit !== undefined) expect(['STR', 'IN_F', 'BOOL']).toContain(unit)
    }
    const first = all(part(entries, 'visio/pages/pages.xml'), 'Page')[0] as XmlElement
    expect(attributeOf(first, 'Name')).not.toBe('')
  })

  it('gives every part a content type and every relationship a target', async () => {
    const entries = await richEntries()
    const types = part(entries, '[Content_Types].xml')
    const defaults = own(types, 'Default').map((item) => attributeOf(item, 'Extension'))
    const overrides = own(types, 'Override').map((item) => attributeOf(item, 'PartName'))
    const names = entries.map((entry) => entry.name)
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length)
    for (const name of names) {
      if (name === '[Content_Types].xml') continue
      const extension = name.slice(name.lastIndexOf('.') + 1)
      expect(overrides.includes(`/${name}`) || defaults.includes(extension)).toBe(true)
    }
    for (const name of names.filter((item) => item.endsWith('.rels'))) {
      const ids = own(part(entries, name), 'Relationship').map((item) => attributeOf(item, 'Id'))
      expect(new Set(ids).size).toBe(ids.length)
    }
    const root = own(part(entries, '_rels/.rels'), 'Relationship').map((item) =>
      attributeOf(item, 'Type'),
    )
    expect(root).toContain('http://schemas.microsoft.com/visio/2010/relationships/document')
  })
})
