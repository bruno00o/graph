import { wrapMargin } from '../shapes/text'
import type { Key, Mark } from '../types'
import { drawingOf, type EditorFrame, type ShapeEditor } from './editor'
import { lineSpacing } from './text'

const svgNamespace = 'http://www.w3.org/2000/svg'
const accent = 'var(--graph-accent,#c93700)'
const paper = 'var(--graph-paper,#ffffff)'

/** Options of `mountShapeEditor`. */
export interface ShapeEditorViewOptions {
  /** Text that the input of a shape shows while it is empty. Defaults to none. */
  readonly placeholder?: string | undefined
}

/** The layer `mountShapeEditor` draws. */
export interface ShapeEditorView {
  /** The SVG element laid over the graph. */
  readonly element: SVGSVGElement
  /** The input of the text being typed into a shape, hidden the rest of the time. */
  readonly input: HTMLTextAreaElement
  /** Changes options; the options left out keep their value. */
  update(options: ShapeEditorViewOptions): void
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
 * changes, the handles of the selected shapes, and the input of the text being typed. Shows no text
 * of its own.
 */
export function mountShapeEditor<M extends Mark>(
  editor: ShapeEditor<M>,
  options: ShapeEditorViewOptions = {},
): ShapeEditorView {
  const drawing = drawingOf(editor)
  const element = document.createElementNS(svgNamespace, 'svg')
  element.setAttribute('aria-hidden', 'true')
  element.setAttribute('data-shape-editor', '')
  element.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden'
  const shapes = document.createElementNS(svgNamespace, 'g')
  const sketch = path(
    `fill:none;stroke:${accent};stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round`,
  )
  sketch.setAttribute('fill-rule', 'evenodd')
  const box = path(`fill:none;stroke:${accent};stroke-width:1;stroke-dasharray:4 3`)
  const middles = path(`fill:${paper};stroke:${accent};stroke-width:1;opacity:0.75`)
  const handles = path(`fill:${paper};stroke:${accent};stroke-width:1.5`)
  const active = path(`fill:${accent};stroke:${accent};stroke-width:1.5`)
  element.append(shapes, box, middles, handles, active, sketch)
  const input = document.createElement('textarea')
  input.setAttribute('data-shape-editor-text', '')
  input.style.cssText = `position:absolute;left:0;top:0;display:none;box-sizing:border-box;margin:0;border:0;outline:none;resize:none;overflow:hidden;background:transparent;color:var(--graph-ink,#1c1c1c);text-align:center;line-height:${lineSpacing}`
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  mirror.style.cssText = `position:absolute;left:0;top:0;display:none;visibility:hidden;pointer-events:none;box-sizing:border-box;overflow-wrap:break-word;line-height:${lineSpacing}`
  input.addEventListener('input', () => {
    editor.setText(input.value)
    place()
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
      event.preventDefault()
      editor.endText()
    }
  })
  input.addEventListener('blur', () => editor.endText())
  drawing.element.append(element, input, mirror)
  let shown: EditorFrame | null = null
  let typed: Key | null = null

  function update(next: ShapeEditorViewOptions): void {
    if (Object.hasOwn(next, 'placeholder')) input.placeholder = next.placeholder ?? ''
  }

  function place(): void {
    const text = editor.store.state.text
    if (!text) {
      if (typed === null) return
      typed = null
      if (document.activeElement === input) drawing.element.focus({ preventScroll: true })
      input.style.display = 'none'
      mirror.style.display = 'none'
      mirror.textContent = ''
      return
    }
    const style = input.style
    const pad = text.fontSize * wrapMargin
    if (typed !== text.key) {
      typed = text.key
      input.value = text.text
      style.display = ''
      mirror.style.display = ''
    }
    const width = `${Math.max(text.width, pad * 4)}px`
    const font = text.fontFamily ?? 'var(--graph-font,system-ui,sans-serif)'
    const space = text.wrap ? 'pre-wrap' : 'pre'
    for (const target of [style, mirror.style]) {
      target.width = width
      target.fontSize = `${text.fontSize}px`
      target.fontWeight = String(text.fontWeight)
      target.fontFamily = font
      target.whiteSpace = space
      target.paddingLeft = `${pad}px`
      target.paddingRight = `${pad}px`
    }
    mirror.textContent = `${input.value || input.placeholder}\u200b`
    const content = mirror.offsetHeight
    const height = Math.max(text.height, content + pad * 2)
    const top = Math.max(0, (height - content) / 2)
    style.left = `${text.x}px`
    style.top = `${text.y}px`
    style.paddingTop = `${top}px`
    style.paddingBottom = `${Math.max(0, height - content - top)}px`
    style.height = `${height}px`
    input.scrollTop = 0
    if (document.activeElement !== input) input.focus({ preventScroll: true })
  }

  function draw(): void {
    place()
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
      const preview = shapes.children[index] as SVGPathElement | undefined
      if (!preview) return
      preview.setAttribute('d', shape.d)
      preview.style.fill = shape.fill ?? 'none'
      preview.style.stroke = shape.stroke && shape.width > 0 ? shape.stroke : 'none'
      preview.setAttribute('stroke-width', String(shape.width))
      preview.setAttribute('stroke-linecap', shape.dash === 2 ? 'round' : 'butt')
      preview.setAttribute('stroke-dasharray', dashOf(shape.dash, shape.width))
      preview.setAttribute('opacity', String(shape.opacity))
    })
    sketch.setAttribute('d', frame.drawing)
    sketch.style.fill = frame.drawingFill ? `color-mix(in srgb,${accent} 20%,transparent)` : 'none'
    box.setAttribute('d', frame.box)
    middles.setAttribute('d', frame.middles)
    handles.setAttribute('d', frame.handles)
    active.setAttribute('d', frame.active)
  }

  update(options)
  let stop: () => void = () => {}
  function destroy(): void {
    stop()
    element.remove()
    input.remove()
    mirror.remove()
  }
  stop = drawing.listen((destroyed) => {
    if (destroyed) destroy()
    else draw()
  })
  return { element, input, update, destroy }
}
