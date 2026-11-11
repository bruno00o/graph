import { type ShapeLook, type ShapeSvgPen, shapeKinds } from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import { num, paintAttribute } from './svg-format'

export function writeShapesSvg(store: ShapeStore, pen: ShapeSvgPen): string {
  const zoom = pen.zoom
  let offsetX = pen.offsetX
  let offsetY = pen.offsetY
  const body: string[] = []

  function place(index: number): void {
    const node = store.pinNode?.[index] ?? -1
    const positions = pen.positions
    offsetX = pen.offsetX + (node >= 0 && positions ? positions.x(node) * zoom : 0)
    offsetY = pen.offsetY + (node >= 0 && positions ? positions.y(node) * zoom : 0)
  }

  function ringPath(points: Float64Array, from: number, to: number, closed: boolean): string {
    let path = ''
    for (let k = from; k < to; k++) {
      const x = (points[k * 2] ?? 0) * zoom + offsetX
      const y = (points[k * 2 + 1] ?? 0) * zoom + offsetY
      path += `${k === from ? 'M' : 'L'}${num(x)} ${num(y)}`
    }
    return closed ? `${path}Z` : path
  }

  function roundPath(index: number): string {
    const round = store.geometry[index]?.round
    if (!round) return ''
    const cx = (round[0] ?? 0) * zoom + offsetX
    const cy = (round[1] ?? 0) * zoom + offsetY
    if (store.geometry[index]?.kind === shapeKinds.circle) {
      const circle = (r: number) =>
        r > 0
          ? `M${num(cx)} ${num(cy - r)}A${num(r)} ${num(r)} 0 1 1 ${num(cx)} ${num(cy + r)}A${num(r)} ${num(r)} 0 1 1 ${num(cx)} ${num(cy - r)}Z`
          : ''
      return circle((round[2] ?? 0) * zoom) + circle((round[3] ?? 0) * zoom)
    }
    const hw = (round[2] ?? 0) * zoom
    const hh = (round[3] ?? 0) * zoom
    const r = Math.min((round[4] ?? 0) * zoom, hw, hh)
    const arc = (x: number, y: number) =>
      r > 0 ? `A${num(r)} ${num(r)} 0 0 1 ${num(x)} ${num(y)}` : ''
    return `M${num(cx)} ${num(cy - hh)}H${num(cx + hw - r)}${arc(cx + hw, cy - hh + r)}V${num(cy + hh - r)}${arc(cx + hw - r, cy + hh)}H${num(cx - hw + r)}${arc(cx - hw, cy + hh - r)}V${num(cy - hh + r)}${arc(cx - hw + r, cy - hh)}Z`
  }

  function strokes(index: number): readonly [string, number][] {
    const geometry = store.geometry[index]
    if (!geometry) return []
    if (geometry.round) {
      const path = roundPath(index)
      const round = geometry.round
      const hw = Math.max(0, (round[2] ?? 0) - (round[4] ?? 0))
      const hh = Math.max(0, (round[3] ?? 0) - (round[4] ?? 0))
      const perimeter =
        geometry.kind === shapeKinds.circle
          ? 2 * Math.PI * (round[2] ?? 0)
          : 4 * (hw + hh) + 2 * Math.PI * (round[4] ?? 0)
      return [[path, perimeter * zoom]]
    }
    const { points, rings, closed } = geometry
    const pieces: [string, number][] = []
    let start = 0
    for (const end of rings) {
      let perimeter = 0
      for (let k = start; closed && k < end; k++) {
        const j = k + 1 < end ? k + 1 : start
        perimeter += Math.hypot(
          (points[j * 2] ?? 0) - (points[k * 2] ?? 0),
          (points[j * 2 + 1] ?? 0) - (points[k * 2 + 1] ?? 0),
        )
      }
      pieces.push([ringPath(points, start, end, closed), perimeter * zoom])
      start = end
    }
    return pieces
  }

  function stroke(index: number, look: ShapeLook | null): void {
    if (!look) return
    place(index)
    const width = look.strokeWidth
    const color = pen.paint(look.stroke)
    const alpha = color.alpha * look.opacity
    if (width <= 0 || alpha <= 0) return
    const tone = paintAttribute('stroke', { hex: color.hex, alpha })
    const dash = store.dash[index] ?? 0
    const pieces = strokes(index)
    if (dash === 0) {
      const d = pieces.map(([path]) => path).join('')
      body.push(
        `<path d="${d}" fill="none"${tone} stroke-width="${num(width)}" stroke-linejoin="miter"/>`,
      )
      return
    }
    for (const [d, perimeter] of pieces) {
      let period = dash === 1 ? Math.max(width * 5, 8) : Math.max(width * 2.5, 4)
      if (perimeter > 0) period = perimeter / Math.max(1, Math.round(perimeter / period))
      const style =
        dash === 1
          ? ` stroke-width="${num(width)}" stroke-dasharray="${num(period * 0.6)} ${num(period * 0.4)}"`
          : ` stroke-width="${num(Math.max(width * 0.6, 1) * 2)}" stroke-linecap="round" stroke-dasharray="0 ${num(period)}" stroke-dashoffset="${num(-period / 2)}"`
      body.push(`<path d="${d}" fill="none"${tone}${style}/>`)
    }
  }

  function fill(index: number, look: ShapeLook | null): void {
    if (!look) return
    place(index)
    const geometry = store.geometry[index]
    const color = pen.paint(look.fill)
    const alpha = color.alpha * look.opacity
    if (!geometry || alpha <= 0 || geometry.kind === shapeKinds.line) return
    const d = geometry.round
      ? roundPath(index)
      : strokes(index)
          .map(([path]) => path)
          .join('')
    const rule = geometry.round ? ' fill-rule="evenodd"' : ''
    body.push(`<path d="${d}"${rule}${paintAttribute('fill', { hex: color.hex, alpha })}/>`)
  }

  const all = store.drawOrder()
  const looks = new Map<number, ShapeLook | null>()
  const lookOf = (index: number) => {
    if (!looks.has(index)) looks.set(index, pen.look(index))
    return looks.get(index) ?? null
  }
  const order = all.filter((index) => !pen.raised(index))
  const raised = all.filter((index) => pen.raised(index))
  let first = 0
  while (first < order.length) {
    const head = order[first] ?? 0
    const round = store.geometry[head]?.round !== null
    const slot = store.slot[head] ?? 0
    let last = first
    while (last < order.length) {
      const index = order[last] ?? 0
      if ((store.geometry[index]?.round !== null) !== round || store.slot[index] !== slot) break
      last++
    }
    for (let at = first; at < last; at++) {
      const index = order[at] ?? 0
      fill(index, lookOf(index))
      if (round) stroke(index, lookOf(index))
    }
    for (let at = first; !round && at < last; at++) {
      const index = order[at] ?? 0
      stroke(index, lookOf(index))
    }
    first = last
  }
  for (const index of raised) {
    fill(index, lookOf(index))
    stroke(index, lookOf(index))
  }
  return body.join('')
}
