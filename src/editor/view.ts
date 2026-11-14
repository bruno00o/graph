import type { Mark } from '../types'
import { drawingOf, type EditorFrame, type ShapeEditor } from './editor'

const svgNamespace = 'http://www.w3.org/2000/svg'
const accent = 'var(--graph-accent,#c93700)'
const paper = 'var(--graph-paper,#ffffff)'

/** The layer `mountShapeEditor` draws. */
export interface ShapeEditorView {
  /** The SVG element laid over the graph. */
  readonly element: SVGSVGElement
  /** Removes the layer. */
  destroy(): void
}

function path(style: string): SVGPathElement {
  const element = document.createElementNS(svgNamespace, 'path')
  element.style.cssText = style
  return element
}

function dashOf(dash: number, width: number): string {
  if (dash === 1) {
    const period = Math.max(width * 5, 8)
    return `${period * 0.6} ${period * 0.4}`
  }
  if (dash === 2) return `0 ${Math.max(width * 2.5, 4)}`
  return ''
}

/**
 * Draws a shape editor over its graph: the shapes being edited, as they will be once their data
 * changes, and the handles of the selected shapes. Shows no text.
 */
export function mountShapeEditor<M extends Mark>(editor: ShapeEditor<M>): ShapeEditorView {
  const drawing = drawingOf(editor)
  const element = document.createElementNS(svgNamespace, 'svg')
  element.setAttribute('aria-hidden', 'true')
  element.setAttribute('data-shape-editor', '')
  element.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden'
  const shapes = document.createElementNS(svgNamespace, 'g')
  const box = path(`fill:none;stroke:${accent};stroke-width:1;stroke-dasharray:4 3`)
  const middles = path(`fill:${paper};stroke:${accent};stroke-width:1;opacity:0.75`)
  const handles = path(`fill:${paper};stroke:${accent};stroke-width:1.5`)
  const active = path(`fill:${accent};stroke:${accent};stroke-width:1.5`)
  element.append(shapes, box, middles, handles, active)
  drawing.element.append(element)
  let shown: EditorFrame | null = null

  function draw(): void {
    const frame = drawing.frame()
    if (frame === shown) return
    shown = frame
    while (shapes.childElementCount > frame.shapes.length) shapes.lastElementChild?.remove()
    while (shapes.childElementCount < frame.shapes.length) {
      const preview = document.createElementNS(svgNamespace, 'path')
      preview.setAttribute('fill-rule', 'evenodd')
      preview.setAttribute('stroke-linejoin', 'round')
      shapes.append(preview)
    }
    frame.shapes.forEach((shape, index) => {
      const preview = shapes.children[index]
      if (!preview) return
      preview.setAttribute('d', shape.d)
      preview.setAttribute('fill', shape.fill ?? 'none')
      preview.setAttribute('stroke', shape.stroke && shape.width > 0 ? shape.stroke : 'none')
      preview.setAttribute('stroke-width', String(shape.width))
      preview.setAttribute('stroke-linecap', shape.dash === 2 ? 'round' : 'butt')
      preview.setAttribute('stroke-dasharray', dashOf(shape.dash, shape.width))
      preview.setAttribute('opacity', String(shape.opacity))
    })
    box.setAttribute('d', frame.box)
    middles.setAttribute('d', frame.middles)
    handles.setAttribute('d', frame.handles)
    active.setAttribute('d', frame.active)
  }

  let stop: () => void = () => {}
  function destroy(): void {
    stop()
    element.remove()
  }
  stop = drawing.listen((destroyed) => {
    if (destroyed) destroy()
    else draw()
  })
  return { element, destroy }
}
