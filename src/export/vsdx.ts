import type {
  Diagram,
  DiagramColor,
  DiagramEdge,
  DiagramNode,
  DiagramPoint,
  DiagramText,
} from './diagram'
import { attribute } from './drawio'
import { type ZipEntry, zip } from './zip'

const inch = 96
const charWidth = 0.75
const lineHeight = 1.25
const margin = 2
const curveSteps = 8
const arrowHead = 13
const mainNamespace = 'http://schemas.microsoft.com/office/visio/2012/main'
const relationNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const visioRelations = 'http://schemas.microsoft.com/visio/2010/relationships'
const packageRelations = 'http://schemas.openxmlformats.org/package/2006/relationships'
const xmlHead = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n'

const genericFonts: Readonly<Record<string, string>> = {
  'system-ui': 'Calibri',
  'ui-sans-serif': 'Calibri',
  'sans-serif': 'Calibri',
  'ui-serif': 'Cambria',
  serif: 'Cambria',
  'ui-monospace': 'Consolas',
  monospace: 'Consolas',
}

function inches(value: number): string {
  const rounded = Math.round((value / inch) * 1e6) / 1e6
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function plain(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function faceOf(font: string): string {
  const first = font.split(',')[0]?.trim() ?? ''
  return genericFonts[first] ?? (first === '' ? 'Calibri' : first)
}

function cell(name: string, value: string | number, extra = ''): string {
  const text = typeof value === 'number' ? plain(value) : attribute(value)
  return `<Cell N="${name}" V="${text}"${extra}/>`
}

function length(name: string, value: number, formula?: string): string {
  return cell(name, Number(inches(value)), formula ? ` F="${attribute(formula)}"` : '')
}

function row(type: string, index: number, cells: string): string {
  return `<Row T="${type}" IX="${index}">${cells}</Row>`
}

function transparency(alpha: number): number {
  return Math.max(0, Math.min(1, 1 - alpha))
}

function textSize(text: DiagramText): { width: number; height: number } {
  const lines = text.text.split('\n')
  const longest = lines.reduce((most, line) => Math.max(most, line.length), 0)
  return {
    width: longest * text.size * charWidth + margin * 4,
    height: lines.length * text.size * lineHeight + margin * 2,
  }
}

function lineCells(color: DiagramColor | null, width: number, opacity: number, pattern: number) {
  if (!color || width <= 0) return cell('LinePattern', 0)
  return [
    cell('LineColor', color.hex),
    cell('LineColorTrans', transparency(color.alpha * opacity)),
    length('LineWeight', width),
    cell('LinePattern', pattern),
  ].join('')
}

function fillCells(color: DiagramColor | null, opacity: number): string {
  if (!color) return cell('FillPattern', 0)
  return [
    cell('FillForegnd', color.hex),
    cell('FillForegndTrans', transparency(color.alpha * opacity)),
    cell('FillPattern', 1),
  ].join('')
}

function textCells(text: DiagramText, opacity: number, faces: Map<string, number>): string {
  const face = faceOf(text.font)
  if (!faces.has(face)) faces.set(face, faces.size)
  const background = text.background
  return [
    cell('LeftMargin', Number(inches(margin))),
    cell('RightMargin', Number(inches(margin))),
    cell('TopMargin', Number(inches(margin))),
    cell('BottomMargin', Number(inches(margin))),
    background
      ? cell('TextBkgnd', background.hex) +
        cell('TextBkgndTrans', transparency(background.alpha * opacity))
      : '',
  ].join('')
}

function textSections(text: DiagramText, opacity: number, align: number): string {
  const face = faceOf(text.font)
  return [
    '<Section N="Character"><Row IX="0">',
    cell('Font', face),
    cell('Color', text.color.hex),
    cell('ColorTrans', transparency(text.color.alpha * text.opacity * opacity)),
    cell('Style', text.bold ? 1 : 0),
    length('Size', text.size),
    '</Row></Section>',
    `<Section N="Paragraph"><Row IX="0">${cell('HorzAlign', align)}</Row></Section>`,
  ].join('')
}

function textElement(text: DiagramText): string {
  return `<Text><cp IX="0"/><pp IX="0"/>${attribute(text.text).replace(/&#10;/g, '\n')}</Text>`
}

function keySection(key: string | number): string {
  return [
    '<Section N="Property"><Row N="Key">',
    cell('Value', String(key), ' U="STR"'),
    cell('Label', 'Key'),
    cell('Type', 0),
    '</Row></Section>',
  ].join('')
}

function nodeGeometry(node: DiagramNode): string {
  const w = node.width
  const h = node.height
  const empty = cell('NoFill', node.fill ? 0 : 1) + cell('NoLine', 0) + cell('NoShow', 0)
  if (node.shape === 'ellipse') {
    return `<Section N="Geometry" IX="0">${empty}${row(
      'Ellipse',
      1,
      length('X', w / 2, 'Width*0.5') +
        length('Y', h / 2, 'Height*0.5') +
        length('A', w, 'Width*1') +
        length('B', h / 2, 'Height*0.5') +
        length('C', w / 2, 'Width*0.5') +
        length('D', h, 'Height*1'),
    )}</Section>`
  }
  const corners: [number, number, string, string][] =
    node.shape === 'diamond'
      ? [
          [w / 2, 0, 'Width*0.5', 'Height*0'],
          [w, h / 2, 'Width*1', 'Height*0.5'],
          [w / 2, h, 'Width*0.5', 'Height*1'],
          [0, h / 2, 'Width*0', 'Height*0.5'],
        ]
      : [
          [0, 0, 'Width*0', 'Height*0'],
          [w, 0, 'Width*1', 'Height*0'],
          [w, h, 'Width*1', 'Height*1'],
          [0, h, 'Width*0', 'Height*1'],
        ]
  const rows = [...corners, corners[0] as [number, number, string, string]].map(
    ([x, y, fx, fy], index) =>
      row(index === 0 ? 'MoveTo' : 'LineTo', index + 1, length('X', x, fx) + length('Y', y, fy)),
  )
  return `<Section N="Geometry" IX="0">${empty}${rows.join('')}</Section>`
}

const textPlacement = {
  bottom: { x: 0.5, y: 0, dx: 0, dy: -0.5, vertical: 0, align: 1 },
  top: { x: 0.5, y: 1, dx: 0, dy: 0.5, vertical: 2, align: 1 },
  right: { x: 1, y: 0.5, dx: 0.5, dy: 0, vertical: 1, align: 0 },
  left: { x: 0, y: 0.5, dx: -0.5, dy: 0, vertical: 1, align: 2 },
  center: { x: 0.5, y: 0.5, dx: 0, dy: 0, vertical: 1, align: 1 },
} as const

interface Writer {
  readonly ids: Map<DiagramNode | DiagramEdge, number>
  readonly faces: Map<string, number>
  readonly height: number
  next: number
}

function idOf(writer: Writer, cell: DiagramNode | DiagramEdge): number {
  let id = writer.ids.get(cell)
  if (id === undefined) {
    id = writer.next++
    writer.ids.set(cell, id)
  }
  return id
}

function nodeShape(writer: Writer, node: DiagramNode, members: readonly string[]): string {
  const parent = node.parent
  const left = parent ? parent.x - parent.width / 2 : 0
  const bottom = parent ? parent.y + parent.height / 2 : writer.height
  const cells = [
    length('PinX', node.x - left),
    length('PinY', bottom - node.y),
    length('Width', node.width),
    length('Height', node.height),
    length('LocPinX', node.width / 2, 'Width*0.5'),
    length('LocPinY', node.height / 2, 'Height*0.5'),
    cell('Angle', 0),
    cell('FlipX', 0),
    cell('FlipY', 0),
    cell('ResizeMode', 0),
    fillCells(node.fill, node.opacity),
    lineCells(node.stroke, node.strokeWidth, node.opacity, 1),
    length('Rounding', node.shape === 'rectangle' ? node.corner : 0),
  ]
  if (node.container) cells.push(cell('DisplayMode', 1), cell('SelectMode', 1))
  const label = node.label
  let sections = ''
  let text = ''
  if (label) {
    const place = textPlacement[node.placement]
    const size = textSize(label)
    const width = node.placement === 'center' ? Math.max(node.width, size.width) : size.width
    cells.push(
      length('TxtPinX', node.width * place.x + width * place.dx),
      length('TxtPinY', node.height * place.y + size.height * place.dy),
      length('TxtWidth', width),
      length('TxtHeight', size.height),
      length('TxtLocPinX', width / 2),
      length('TxtLocPinY', size.height / 2),
      cell('TxtAngle', 0),
      cell('VerticalAlign', place.vertical),
      textCells(label, node.opacity, writer.faces),
    )
    sections = textSections(label, node.opacity, place.align)
    text = textElement(label)
  }
  const type = node.container ? 'Group' : 'Shape'
  const children = node.container ? `<Shapes>${members.join('')}</Shapes>` : ''
  return [
    `<Shape ID="${idOf(writer, node)}" Type="${type}" LineStyle="0" FillStyle="0" TextStyle="0">`,
    cells.join(''),
    sections,
    keySection(node.key),
    nodeGeometry(node),
    text,
    children,
    '</Shape>',
  ].join('')
}

function border(node: DiagramNode, toward: DiagramPoint): DiagramPoint {
  const dx = toward.x - node.x
  const dy = toward.y - node.y
  const rx = node.width / 2
  const ry = node.height / 2
  if ((dx === 0 && dy === 0) || rx <= 0 || ry <= 0) return { x: node.x, y: node.y }
  const scale =
    node.shape === 'ellipse'
      ? 1 / Math.hypot(dx / rx, dy / ry)
      : node.shape === 'diamond'
        ? 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry)
        : Math.min(dx === 0 ? Infinity : rx / Math.abs(dx), dy === 0 ? Infinity : ry / Math.abs(dy))
  const reach = Math.min(1, scale)
  return { x: node.x + dx * reach, y: node.y + dy * reach }
}

function quadratic(
  path: DiagramPoint[],
  from: DiagramPoint,
  control: DiagramPoint,
  to: DiagramPoint,
): void {
  for (let step = 1; step <= curveSteps; step++) {
    const t = step / curveSteps
    const u = 1 - t
    path.push({
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    })
  }
}

export function edgePath(edge: DiagramEdge): DiagramPoint[] {
  const points = edge.points
  const first = points[0] ?? edge.target
  const last = points[points.length - 1] ?? edge.source
  const start = border(edge.source, first)
  const end = border(edge.target, last)
  const path: DiagramPoint[] = [start]
  if (!edge.smooth || points.length === 0) {
    path.push(...points, end)
    return path
  }
  let from = start
  for (let index = 0; index < points.length; index++) {
    const control = points[index] as DiagramPoint
    const next = points[index + 1]
    const to = next ? { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 } : end
    quadratic(path, from, control, to)
    from = to
  }
  return path
}

function along(path: readonly DiagramPoint[], share: number): DiagramPoint {
  let total = 0
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1] as DiagramPoint
    const b = path[index] as DiagramPoint
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }
  let left = total * share
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1] as DiagramPoint
    const b = path[index] as DiagramPoint
    const step = Math.hypot(b.x - a.x, b.y - a.y)
    if (step >= left && step > 0) {
      const t = left / step
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    left -= step
  }
  return path[path.length - 1] ?? { x: 0, y: 0 }
}

function edgeShape(writer: Writer, edge: DiagramEdge): string {
  const path = edgePath(edge)
  const start = path[0] as DiagramPoint
  const end = path[path.length - 1] as DiagramPoint
  const height = writer.height
  const pattern = edge.dash === 'dashed' ? 2 : edge.dash === 'dotted' ? 3 : 1
  const sourceId = idOf(writer, edge.source)
  const targetId = idOf(writer, edge.target)
  const cells = [
    length('PinX', (start.x + end.x) / 2, 'GUARD((BeginX+EndX)/2)'),
    length('PinY', height - (start.y + end.y) / 2, 'GUARD((BeginY+EndY)/2)'),
    length('Width', end.x - start.x, 'GUARD(EndX-BeginX)'),
    length('Height', start.y - end.y, 'GUARD(EndY-BeginY)'),
    length('LocPinX', (end.x - start.x) / 2, 'GUARD(Width*0.5)'),
    length('LocPinY', (start.y - end.y) / 2, 'GUARD(Height*0.5)'),
    cell('Angle', 0),
    length('BeginX', start.x, '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'),
    length('BeginY', height - start.y, '_WALKGLUE(BegTrigger,EndTrigger,WalkPreference)'),
    length('EndX', end.x, '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'),
    length('EndY', height - end.y, '_WALKGLUE(EndTrigger,BegTrigger,WalkPreference)'),
    cell('BegTrigger', 2, ` F="_XFTRIGGER(Sheet.${sourceId}!EventXFMod)"`),
    cell('EndTrigger', 2, ` F="_XFTRIGGER(Sheet.${targetId}!EventXFMod)"`),
    cell('ObjType', 2),
    cell('ConFixedCode', 2),
    lineCells(edge.color, edge.width, edge.opacity, pattern),
    cell('BeginArrow', edge.startArrow ? arrowHead : 0),
    cell('EndArrow', edge.endArrow ? arrowHead : 0),
    cell('BeginArrowSize', 2),
    cell('EndArrowSize', 2),
  ]
  const label = edge.label
  let sections = ''
  let text = ''
  if (label) {
    const anchor = along(path, 0.5)
    const size = textSize(label)
    const lift = label.background ? 0 : size.height / 2 + edge.width / 2
    cells.push(
      length('TxtPinX', anchor.x - start.x),
      length('TxtPinY', start.y - anchor.y + lift),
      length('TxtWidth', size.width),
      length('TxtHeight', size.height),
      length('TxtLocPinX', size.width / 2),
      length('TxtLocPinY', size.height / 2),
      cell('TxtAngle', 0),
      cell('VerticalAlign', 1),
      textCells(label, edge.opacity, writer.faces),
    )
    sections = textSections(label, edge.opacity, 1)
    text = textElement(label)
  }
  const rows = path.map((point, index) => {
    const x = point.x - start.x
    const y = start.y - point.y
    const last = index === path.length - 1
    const fx = index === 0 ? 'Width*0' : last ? 'Width*1' : `${inches(point.x)} in-BeginX`
    const fy =
      index === 0 ? 'Height*0' : last ? 'Height*1' : `${inches(height - point.y)} in-BeginY`
    return row(
      index === 0 ? 'MoveTo' : 'LineTo',
      index + 1,
      length('X', x, fx) + length('Y', y, fy),
    )
  })
  return [
    `<Shape ID="${idOf(writer, edge)}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">`,
    cells.join(''),
    sections,
    keySection(edge.key),
    '<Section N="Geometry" IX="0">',
    cell('NoFill', 1),
    cell('NoLine', 0),
    cell('NoShow', 0),
    rows.join(''),
    '</Section>',
    text,
    '</Shape>',
  ].join('')
}

function endText(writer: Writer, edge: DiagramEdge, text: DiagramText, share: number): string {
  const anchor = along(edgePath(edge), share)
  const size = textSize(text)
  return [
    `<Shape ID="${writer.next++}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">`,
    length('PinX', anchor.x),
    length('PinY', writer.height - anchor.y),
    length('Width', size.width),
    length('Height', size.height),
    length('LocPinX', size.width / 2, 'Width*0.5'),
    length('LocPinY', size.height / 2, 'Height*0.5'),
    cell('FillPattern', 0),
    cell('LinePattern', 0),
    cell('VerticalAlign', 1),
    textCells(text, edge.opacity, writer.faces),
    textSections(text, edge.opacity, 1),
    textElement(text),
    '</Shape>',
  ].join('')
}

function backdrop(writer: Writer, diagram: Diagram, color: DiagramColor): string {
  const width = diagram.width
  const height = diagram.height
  return [
    `<Shape ID="${writer.next++}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">`,
    length('PinX', width / 2),
    length('PinY', height / 2),
    length('Width', width),
    length('Height', height),
    length('LocPinX', width / 2, 'Width*0.5'),
    length('LocPinY', height / 2, 'Height*0.5'),
    fillCells(color, 1),
    cell('LinePattern', 0),
    cell('LockMoveX', 1),
    cell('LockMoveY', 1),
    cell('LockWidth', 1),
    cell('LockHeight', 1),
    cell('LockTextEdit', 1),
    '<Section N="Geometry" IX="0">',
    cell('NoFill', 0),
    cell('NoLine', 1),
    cell('NoShow', 0),
    row('MoveTo', 1, length('X', 0, 'Width*0') + length('Y', 0, 'Height*0')),
    row('LineTo', 2, length('X', width, 'Width*1') + length('Y', 0, 'Height*0')),
    row('LineTo', 3, length('X', width, 'Width*1') + length('Y', height, 'Height*1')),
    row('LineTo', 4, length('X', 0, 'Width*0') + length('Y', height, 'Height*1')),
    row('LineTo', 5, length('X', 0, 'Width*0') + length('Y', 0, 'Height*0')),
    '</Section></Shape>',
  ].join('')
}

function pageContents(diagram: Diagram, faces: Map<string, number>): string {
  const writer: Writer = { ids: new Map(), faces, height: diagram.height, next: 1 }
  const shapes: string[] = []
  if (diagram.background) shapes.push(backdrop(writer, diagram, diagram.background))
  const children = new Map<DiagramNode, DiagramNode[]>()
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  for (const cell of diagram.cells) {
    if (cell.kind === 'edge') {
      edges.push(cell)
      continue
    }
    if (cell.container) idOf(writer, cell)
    nodes.push(cell)
    if (cell.parent) {
      const list = children.get(cell.parent)
      if (list) list.push(cell)
      else children.set(cell.parent, [cell])
    }
  }
  for (const node of nodes) idOf(writer, node)
  const written = new Map<DiagramNode, string>()
  const write = (node: DiagramNode): string => {
    let found = written.get(node)
    if (found === undefined) {
      found = nodeShape(writer, node, (children.get(node) ?? []).map(write))
      written.set(node, found)
    }
    return found
  }
  for (const node of nodes) if (!node.parent) shapes.push(write(node))
  const connects: string[] = []
  for (const edge of edges) {
    shapes.push(edgeShape(writer, edge))
    const id = idOf(writer, edge)
    connects.push(
      `<Connect FromSheet="${id}" FromCell="BeginX" FromPart="9" ToSheet="${idOf(writer, edge.source)}" ToCell="PinX" ToPart="3"/>`,
      `<Connect FromSheet="${id}" FromCell="EndX" FromPart="12" ToSheet="${idOf(writer, edge.target)}" ToCell="PinX" ToPart="3"/>`,
    )
  }
  for (const edge of edges) {
    if (edge.sourceLabel) shapes.push(endText(writer, edge, edge.sourceLabel, 0.1))
    if (edge.targetLabel) shapes.push(endText(writer, edge, edge.targetLabel, 0.9))
  }
  return [
    xmlHead,
    `<PageContents xmlns="${mainNamespace}" xmlns:r="${relationNamespace}" xml:space="preserve">`,
    `<Shapes>${shapes.join('')}</Shapes>`,
    connects.length > 0 ? `<Connects>${connects.join('')}</Connects>` : '',
    '</PageContents>',
  ].join('')
}

function relations(list: readonly [string, string][]): string {
  return [
    xmlHead,
    `<Relationships xmlns="${packageRelations}">`,
    ...list.map(
      ([type, target], index) =>
        `<Relationship Id="rId${index + 1}" Type="${type}" Target="${target}"/>`,
    ),
    '</Relationships>',
  ].join('')
}

const contentTypes = [
  xmlHead,
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>',
  '<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>',
  '<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>',
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  '</Types>',
].join('')

const styleSheet = [
  '<StyleSheets><StyleSheet ID="0" NameU="No Style" Name="No Style">',
  cell('EnableLineProps', 1),
  cell('EnableFillProps', 1),
  cell('EnableTextProps', 1),
  cell('HideForApply', 0),
  cell('LineWeight', 0.01041666666666667),
  cell('LineColor', '#000000'),
  cell('LinePattern', 1),
  cell('Rounding', 0),
  cell('EndArrowSize', 2),
  cell('BeginArrow', 0),
  cell('EndArrow', 0),
  cell('LineCap', 0),
  cell('BeginArrowSize', 2),
  cell('LineColorTrans', 0),
  cell('CompoundType', 0),
  cell('FillForegnd', '#ffffff'),
  cell('FillBkgnd', '#ffffff'),
  cell('FillPattern', 1),
  cell('ShdwForegnd', '#000000'),
  cell('ShdwPattern', 0),
  cell('FillForegndTrans', 0),
  cell('FillBkgndTrans', 0),
  cell('ShdwForegndTrans', 0),
  cell('LeftMargin', 0.05555555555555555),
  cell('RightMargin', 0.05555555555555555),
  cell('TopMargin', 0.05555555555555555),
  cell('BottomMargin', 0.05555555555555555),
  cell('VerticalAlign', 1),
  cell('TextDirection', 0),
  '<Section N="Character"><Row IX="0">',
  cell('Font', 'Calibri'),
  cell('Color', '#000000'),
  cell('Style', 0),
  cell('Case', 0),
  cell('Pos', 0),
  cell('FontScale', 1),
  cell('Size', 0.1666666666666667),
  cell('ColorTrans', 0),
  '</Row></Section>',
  '<Section N="Paragraph"><Row IX="0">',
  cell('IndFirst', 0),
  cell('IndLeft', 0),
  cell('IndRight', 0),
  cell('SpLine', -1.2),
  cell('SpBefore', 0),
  cell('SpAfter', 0),
  cell('HorzAlign', 1),
  '</Row></Section>',
  '</StyleSheet></StyleSheets>',
].join('')

function documentPart(faces: ReadonlyMap<string, number>): string {
  const names = [...faces.keys()]
  if (!names.includes('Calibri')) names.push('Calibri')
  return [
    xmlHead,
    `<VisioDocument xmlns="${mainNamespace}" xmlns:r="${relationNamespace}" xml:space="preserve">`,
    '<DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0">',
    '<GlueSettings>9</GlueSettings><SnapSettings>65847</SnapSettings><SnapExtensions>34</SnapExtensions>',
    '<DynamicGridEnabled>0</DynamicGridEnabled><ProtectStyles>0</ProtectStyles><ProtectShapes>0</ProtectShapes>',
    '<ProtectMasters>0</ProtectMasters><ProtectBkgnds>0</ProtectBkgnds>',
    '</DocumentSettings>',
    '<Colors><ColorEntry IX="0" RGB="#000000"/><ColorEntry IX="1" RGB="#FFFFFF"/></Colors>',
    `<FaceNames>${names.map((name) => `<FaceName NameU="${attribute(name)}" Name="${attribute(name)}"/>`).join('')}</FaceNames>`,
    styleSheet,
    '</VisioDocument>',
  ].join('')
}

function pagesPart(diagram: Diagram): string {
  const name = attribute(diagram.title ?? 'Page-1')
  return [
    xmlHead,
    `<Pages xmlns="${mainNamespace}" xmlns:r="${relationNamespace}" xml:space="preserve">`,
    `<Page ID="0" NameU="${name}" Name="${name}" ViewScale="1" ViewCenterX="${inches(diagram.width / 2)}" ViewCenterY="${inches(diagram.height / 2)}">`,
    '<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">',
    length('PageWidth', Math.max(1, diagram.width)),
    length('PageHeight', Math.max(1, diagram.height)),
    cell('ShdwOffsetX', 0.125),
    cell('ShdwOffsetY', -0.125),
    cell('PageScale', 1, ' U="IN_F"'),
    cell('DrawingScale', 1, ' U="IN_F"'),
    cell('DrawingSizeType', 0),
    cell('DrawingScaleType', 0),
    cell('InhibitSnap', 0),
    cell('PageLockReplace', 0, ' U="BOOL"'),
    cell('PageLockDuplicate', 0, ' U="BOOL"'),
    cell('UIVisibility', 0),
    cell('ShdwType', 0),
    cell('ShdwObliqueAngle', 0),
    cell('ShdwScaleFactor', 1),
    cell('DrawingResizeType', 1),
    cell('PageShapeSplit', 1),
    '</PageSheet>',
    '<Rel r:id="rId1"/>',
    '</Page></Pages>',
  ].join('')
}

function corePart(diagram: Diagram): string {
  const title = diagram.title ? `<dc:title>${attribute(diagram.title)}</dc:title>` : ''
  return [
    xmlHead,
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"',
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    title,
    '</cp:coreProperties>',
  ].join('')
}

const appPart = [
  xmlHead,
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"',
  ' xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
  '<Template/><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>',
  '<LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>',
  '</Properties>',
].join('')

export function vsdxParts(diagram: Diagram): ZipEntry[] {
  const encoder = new TextEncoder()
  const faces = new Map<string, number>()
  const page = pageContents(diagram, faces)
  const parts: [string, string][] = [
    ['[Content_Types].xml', contentTypes],
    [
      '_rels/.rels',
      relations([
        [`${visioRelations}/document`, 'visio/document.xml'],
        [`${packageRelations}/metadata/core-properties`, 'docProps/core.xml'],
        [`${relationNamespace}/extended-properties`, 'docProps/app.xml'],
      ]),
    ],
    ['docProps/core.xml', corePart(diagram)],
    ['docProps/app.xml', appPart],
    ['visio/document.xml', documentPart(faces)],
    ['visio/_rels/document.xml.rels', relations([[`${visioRelations}/pages`, 'pages/pages.xml']])],
    ['visio/pages/pages.xml', pagesPart(diagram)],
    ['visio/pages/_rels/pages.xml.rels', relations([[`${visioRelations}/page`, 'page1.xml']])],
    ['visio/pages/page1.xml', page],
  ]
  return parts.map(([name, text]) => ({ name, data: encoder.encode(text) }))
}

export async function writeVsdx(diagram: Diagram): Promise<Blob> {
  const bytes = await zip(vsdxParts(diagram))
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.ms-visio.drawing' })
}
