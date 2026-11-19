import type {
  Diagram,
  DiagramColor,
  DiagramEdge,
  DiagramNode,
  DiagramPlacement,
  DiagramText,
} from './diagram'

type Style = [string, string | number][]

const placementStyles: Readonly<Record<DiagramPlacement, Style>> = {
  bottom: [
    ['verticalLabelPosition', 'bottom'],
    ['verticalAlign', 'top'],
  ],
  top: [
    ['verticalLabelPosition', 'top'],
    ['verticalAlign', 'bottom'],
  ],
  right: [
    ['labelPosition', 'right'],
    ['align', 'left'],
  ],
  left: [
    ['labelPosition', 'left'],
    ['align', 'right'],
  ],
  center: [],
}

const markup = /[&<>"\t\n\r]/g
const references: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\t': '&#9;',
  '\n': '&#10;',
  '\r': '&#13;',
}

function xmlChar(code: number): boolean {
  return code >= 0x20
    ? code !== 0xfffe && code !== 0xffff
    : code === 9 || code === 10 || code === 13
}

function wellFormed(text: string): string {
  let result = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (xmlChar(code) && !(code >= 0xd800 && code <= 0xdfff)) result += char
  }
  return result
}

export function attribute(text: string): string {
  return wellFormed(text).replace(markup, (char) => references[char] ?? char)
}

function number(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function percent(alpha: number): number {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 100)
}

function styleValue(value: string): string {
  return value.replace(/;/g, '')
}

function imageValue(src: string): string {
  const data = /^data:([^,;]*);base64,/i.exec(src)
  const plain = data ? `data:${data[1]},${src.slice(data[0].length)}` : src
  return plain.replace(/;/g, '%3B')
}

function styleOf(style: Style): string {
  return style.map(([key, value]) => `${key}=${value}`).join(';')
}

function paint(style: Style, key: string, opacityKey: string, color: DiagramColor | null): void {
  style.push([key, color ? color.hex : 'none'])
  if (color && color.alpha < 1) style.push([opacityKey, percent(color.alpha)])
}

function textStyle(style: Style, text: DiagramText, edge: boolean): void {
  style.push(['fontSize', number(text.size)])
  style.push(['fontColor', text.color.hex])
  style.push(['fontStyle', text.bold ? 1 : 0])
  if (text.font) style.push(['fontFamily', styleValue(text.font)])
  style.push(['labelBackgroundColor', text.background ? text.background.hex : 'none'])
  const opacity = text.opacity * text.color.alpha
  if (opacity < 1) style.push(['textOpacity', percent(opacity)])
  if (edge && !text.background) style.push(['verticalAlign', 'bottom'])
}

function nodeStyle(node: DiagramNode): string {
  const style: Style = []
  if (node.shape === 'ellipse') {
    style.push(['shape', 'ellipse'])
  } else if (node.shape === 'diamond') {
    style.push(['shape', 'rhombus'])
  } else if (node.corner > 0) {
    style.push(['rounded', 1], ['absoluteArcSize', 1], ['arcSize', number(node.corner * 2)])
  } else {
    style.push(['rounded', 0])
  }
  if (node.shape === 'ellipse') style.push(['perimeter', 'ellipsePerimeter'])
  if (node.shape === 'diamond') style.push(['perimeter', 'rhombusPerimeter'])
  if (node.container) style.push(['container', 1], ['collapsible', 0])
  paint(style, 'fillColor', 'fillOpacity', node.fill)
  paint(style, 'strokeColor', 'strokeOpacity', node.strokeWidth > 0 ? node.stroke : null)
  if (node.strokeWidth > 0) style.push(['strokeWidth', number(node.strokeWidth)])
  if (node.opacity < 1) style.push(['opacity', percent(node.opacity)])
  if (node.label) {
    style.push(...placementStyles[node.placement])
    textStyle(style, node.label, false)
  }
  return styleOf(style)
}

function edgeStyle(edge: DiagramEdge): string {
  const style: Style = [
    ['endArrow', edge.endArrow ? 'block' : 'none'],
    ['startArrow', edge.startArrow ? 'block' : 'none'],
  ]
  if (edge.endArrow) style.push(['endFill', 1])
  if (edge.startArrow) style.push(['startFill', 1])
  style.push(['rounded', 0])
  if (edge.smooth) style.push(['curved', 1])
  paint(style, 'strokeColor', 'strokeOpacity', edge.color)
  style.push(['strokeWidth', number(edge.width)])
  if (edge.dash === 'dashed') style.push(['dashed', 1], ['dashPattern', '3 2'])
  if (edge.dash === 'dotted') style.push(['dashed', 1], ['dashPattern', '1 2'])
  if (edge.opacity < 1) style.push(['opacity', percent(edge.opacity)])
  if (edge.label) textStyle(style, edge.label, true)
  return styleOf(style)
}

function clipOf(node: DiagramNode, side: number): string | null {
  const reach = Math.min(node.width, node.height) / 2 / side
  if (node.shape === 'ellipse') {
    return reach < 0.5 ? `circle(${number(reach * 100)}% at 50% 50%)` : null
  }
  if (reach >= 0.5) return null
  const near = number((0.5 - reach) * 100)
  const far = number((0.5 + reach) * 100)
  return node.shape === 'diamond'
    ? `polygon(50% ${near}%,${far}% 50%,50% ${far}%,${near}% 50%)`
    : `polygon(${near}% ${near}%,${far}% ${near}%,${far}% ${far}%,${near}% ${far}%)`
}

function picture(node: DiagramNode): string {
  const image = node.image
  if (!image) return ''
  const side = image.side
  const style: Style = [
    ['shape', 'image'],
    ['image', imageValue(image.src)],
    ['imageAspect', 1],
    ['pointerEvents', 0],
  ]
  const clip = clipOf(node, side)
  if (clip) style.push(['clipPath', clip])
  if (node.opacity < 1) style.push(['opacity', percent(node.opacity)])
  return [
    `<mxCell id="${attribute(`i${node.id}`)}" value="" style="${attribute(styleOf(style))}"`,
    ` vertex="1" connectable="0" parent="${attribute(node.id)}">`,
    `<mxGeometry x="${number((node.width - side) / 2)}" y="${number((node.height - side) / 2)}"`,
    ` width="${number(side)}" height="${number(side)}" as="geometry"/></mxCell>`,
  ].join('')
}

function vertex(node: DiagramNode): string {
  const parent = node.parent
  const left = node.x - node.width / 2 - (parent ? parent.x - parent.width / 2 : 0)
  const top = node.y - node.height / 2 - (parent ? parent.y - parent.height / 2 : 0)
  return [
    `<mxCell id="${attribute(node.id)}" value="${attribute(node.label?.text ?? '')}"`,
    ` style="${attribute(nodeStyle(node))}" vertex="1" parent="${parent ? attribute(parent.id) : '1'}">`,
    `<mxGeometry x="${number(left)}" y="${number(top)}" width="${number(node.width)}"`,
    ` height="${number(node.height)}" as="geometry"/></mxCell>`,
    picture(node),
  ].join('')
}

function endLabel(edge: DiagramEdge, text: DiagramText, at: number, prefix: string): string {
  const style: Style = [['resizable', 0]]
  textStyle(style, text, false)
  const styled = `edgeLabel;${styleOf(style)}`
  return [
    `<mxCell id="${attribute(prefix + edge.id)}" value="${attribute(text.text)}"`,
    ` style="${attribute(styled)}" vertex="1" connectable="0" parent="${attribute(edge.id)}">`,
    `<mxGeometry x="${at}" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`,
  ].join('')
}

function connector(edge: DiagramEdge): string {
  const points =
    edge.points.length > 0
      ? `<Array as="points">${edge.points
          .map((point) => `<mxPoint x="${number(point.x)}" y="${number(point.y)}"/>`)
          .join('')}</Array>`
      : ''
  const parts = [
    `<mxCell id="${attribute(edge.id)}" value="${attribute(edge.label?.text ?? '')}"`,
    ` style="${attribute(edgeStyle(edge))}" edge="1" parent="1"`,
    ` source="${attribute(edge.source.id)}" target="${attribute(edge.target.id)}">`,
    `<mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`,
  ]
  if (edge.sourceLabel) parts.push(endLabel(edge, edge.sourceLabel, -0.8, 'ls'))
  if (edge.targetLabel) parts.push(endLabel(edge, edge.targetLabel, 0.8, 'lt'))
  return parts.join('')
}

export function writeDrawio(diagram: Diagram): string {
  const width = Math.max(1, Math.ceil(diagram.width))
  const height = Math.max(1, Math.ceil(diagram.height))
  const background = diagram.background ? ` background="${diagram.background.hex}"` : ''
  const name = attribute(diagram.title ?? 'Page-1')
  const cells = diagram.cells.map((cell) => (cell.kind === 'node' ? vertex(cell) : connector(cell)))
  return [
    '<mxfile>',
    `<diagram id="graph" name="${name}">`,
    `<mxGraphModel grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1"`,
    ` fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0"`,
    ` shadow="0"${background}>`,
    '<root><mxCell id="0"/><mxCell id="1" parent="0"/>',
    ...cells,
    '</root></mxGraphModel></diagram></mxfile>',
    '',
  ].join('')
}
