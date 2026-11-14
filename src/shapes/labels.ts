import { noColor } from '../core/columns'
import { globeScreen } from '../core/globe'
import { primaryWeight } from '../core/label-width'
import {
  isDrawn,
  type ShapeLabeler,
  type ShapeLabelFrame,
  type ShapeLabelSelection,
  type ShapeTextBlock,
} from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import { labelAlways, maxStates } from '../core/state-buffers'
import { shapeShown } from '../core/visibility'
import { atlasFontSize } from '../webgl/glyph-atlas'
import {
  builtInRaise,
  cullMargin,
  forcedStates,
  labelLevel,
  labelMin,
  levelBits,
  lifted,
  TextExtents,
} from '../webgl/label-levels'
import { nodeLabelSize, plateDrop, platePadX } from '../webgl/shaders'
import { shapeAnchor } from './anchor'

const padUnits = platePadX * atlasFontSize
const noOrder = new Uint32Array(0)

interface LabelOrder {
  readonly key: string
  readonly order: Uint32Array
  readonly boxes: Float64Array
}

const orders = new WeakMap<ShapeStore, LabelOrder>()

export function labelAnchor(store: ShapeStore, index: number): boolean {
  const labels = store.labels
  const geometry = store.geometry[index]
  if (!labels || !isDrawn(geometry)) return false
  if (Number.isNaN(labels.anchor[index * 2] ?? Number.NaN)) {
    const point = shapeAnchor(geometry)
    labels.anchor[index * 2] = point.x
    labels.anchor[index * 2 + 1] = point.y
    store.anchorVersion++
  }
  return true
}

export function labelOrder(store: ShapeStore): LabelOrder {
  const labels = store.labels
  const key = `${store.version}:${store.labelVersion}`
  const known = orders.get(store)
  if (known?.key === key) return known
  if (!labels || labels.count === 0) return { key, order: noOrder, boxes: new Float64Array(0) }
  const indices = Array.from(store.drawOrder()).filter((index) => !!labels.text[index])
  const area = (index: number) => {
    const geometry = store.geometry[index]
    return geometry ? (geometry.maxX - geometry.minX) * (geometry.maxY - geometry.minY) : 0
  }
  indices.sort((a, b) => area(b) - area(a))
  const boxes = new Float64Array(indices.length * 4)
  indices.forEach((index, at) => {
    const geometry = store.geometry[index]
    boxes[at * 4] = geometry?.minX ?? 0
    boxes[at * 4 + 1] = geometry?.minY ?? 0
    boxes[at * 4 + 2] = geometry?.maxX ?? 0
    boxes[at * 4 + 3] = geometry?.maxY ?? 0
  })
  const made = { key, order: Uint32Array.from(indices), boxes }
  orders.set(store, made)
  return made
}

export function createShapeLabeler(): ShapeLabeler {
  const extents = new TextExtents()
  const projected = { x: 0, y: 0 }
  let shownStore: ShapeStore | null = null
  let shownVersion = -1

  function place(
    selection: ShapeLabelSelection,
    frame: ShapeLabelFrame,
    index: number,
    highlight: boolean,
  ): void {
    const { store, mask, flags, others } = frame
    const texts = store.labels
    const label = texts?.text[index]
    if (!texts || !label || !selection.room() || store.alive[index] !== 1) return
    if (!shapeShown(store, index, selection.sight)) return
    const shown = labelLevel(mask[index] ?? 0, flags, others)
    if (shown === 0) return
    const { view, width, height, positions, minimum } = selection
    const size = texts.labelSize[index] || nodeLabelSize
    const pixels = lifted(size * selection.shrink, size, shown, minimum)
    if (pixels < minimum && shown !== labelAlways) return
    if (!labelAnchor(store, index)) return
    const node = store.pinNode?.[index] ?? -1
    const wx = (texts.anchor[index * 2] ?? 0) + (node >= 0 ? positions.x(node) : 0)
    const wy = (texts.anchor[index * 2 + 1] ?? 0) + (node >= 0 ? positions.y(node) : 0)
    let x = (wx - view.x) * view.zoom + width / 2
    let y = (wy - view.y) * view.zoom + height / 2
    if (selection.globe) {
      if (globeScreen(selection.globe, wx, wy, projected) < 0) return
      x = projected.x
      y = projected.y
    }
    if (x < -cullMargin || x > width + cullMargin) return
    if (y < -cullMargin || y > height + cullMargin) return
    const measure = (): ShapeTextBlock =>
      selection.measure(
        label,
        texts.labelWeight[index] || primaryWeight,
        texts.labelFont[index] ?? null,
        texts.labelMaxWidth[index] ?? 0,
        size,
      )
    let measured = extents.has(index) ? null : measure()
    if (measured) extents.set(index, measured)
    const blockWidth = extents.width(index)
    const blockHeight = extents.height(index)
    const plated = (texts.labelBackground[index] ?? noColor) !== noColor
    const total = blockHeight + (plated ? plateDrop : 0)
    const scale = pixels / atlasFontSize
    const half = (plated ? blockWidth / 2 + padUnits : blockWidth / 2) * scale
    const left = x - half
    const right = x + half
    const top = y - (total / 2) * scale
    const bottom = top + (plated ? total : blockHeight) * scale
    if (right < 0 || left > width || bottom < 0 || top > height) return
    const force = (highlight && ((mask[index] ?? 0) & forcedStates) !== 0) || selection.all
    if (!selection.claim(left, top, right, bottom, force)) return
    measured ??= measure()
    selection.write(index, highlight, measured, size, pixels, x, y)
  }

  function placeAll(selection: ShapeLabelSelection, frame: ShapeLabelFrame): void {
    const texts = frame.store.labels
    if (!texts || texts.count === 0) return
    const { shrink } = selection
    let any =
      selection.all ||
      nodeLabelSize * shrink >= labelMin ||
      levelBits(frame.flags, maxStates, frame.others) !== 0
    for (let index = 0; !any && index < texts.labelSize.length; index++) {
      any = (texts.labelSize[index] ?? 0) * shrink >= labelMin && !!texts.text[index]
    }
    if (any) placeVisible(selection, frame)
  }

  function placeVisible(selection: ShapeLabelSelection, frame: ShapeLabelFrame): void {
    const { store, mask, flags, others } = frame
    const texts = store.labels
    if (!texts) return
    const { view, width, height, positions, shrink, all } = selection
    const raise = frame.raise
    const alwaysBits = levelBits(flags, 0)
    const reach = cullMargin / view.zoom
    const left = view.x - width / 2 / view.zoom - reach
    const right = view.x + width / 2 / view.zoom + reach
    const top = view.y - height / 2 / view.zoom - reach
    const bottom = view.y + height / 2 / view.zoom + reach
    const { order, boxes } = labelOrder(store)
    const pins = store.pinNode
    const anchors = texts.anchor
    const halfWidth = width / 2
    const halfHeight = height / 2
    const skipped = raise | alwaysBits
    for (let at = 0; at < order.length && selection.room(); at++) {
      const index = order[at] ?? 0
      const own = mask[index] ?? 0
      if ((own & skipped) !== 0) {
        if ((own & raise) !== 0) continue
        if ((own & alwaysBits) !== 0 && labelLevel(own, flags, others) === labelAlways) continue
      }
      if (!selection.globe) {
        const node = pins ? (pins[index] ?? -1) : -1
        const ox = node >= 0 ? positions.x(node) : 0
        const oy = node >= 0 ? positions.y(node) : 0
        if ((boxes[at * 4 + 2] ?? 0) + ox < left || (boxes[at * 4] ?? 0) + ox > right) continue
        if ((boxes[at * 4 + 3] ?? 0) + oy < top || (boxes[at * 4 + 1] ?? 0) + oy > bottom) continue
        const x = ((anchors[index * 2] ?? Number.NaN) + ox - view.x) * view.zoom + halfWidth
        const y = ((anchors[index * 2 + 1] ?? 0) + oy - view.y) * view.zoom + halfHeight
        if (x < -cullMargin || x > width + cullMargin) continue
        if (y < -cullMargin || y > height + cullMargin) continue
        if (!all && extents.has(index)) {
          const scale = ((texts.labelSize[index] || nodeLabelSize) * shrink) / atlasFontSize
          const textX = (extents.width(index) / 2) * scale
          const textY = (extents.height(index) / 2) * scale
          const reachX = textX + padUnits * scale
          const reachY = textY + plateDrop * scale
          if (x + reachX < 0 || x - reachX > width || y + reachY < 0 || y - reachY > height) {
            continue
          }
          const onScreen = x + textX >= 0 && x - textX <= width && y + textY >= 0
          if (
            onScreen &&
            y - textY <= height &&
            selection.taken(x - textX, y - textY, x + textX, y + textY)
          ) {
            continue
          }
        }
      }
      place(selection, frame, index, false)
    }
  }

  return {
    place(selection, frame, phase) {
      const { store, mask, flags, others } = frame
      if (!store.labels) return
      if (phase === 0) {
        if (store !== shownStore || store.labelVersion !== shownVersion) {
          shownStore = store
          shownVersion = store.labelVersion
          extents.reset()
        }
        extents.prepare(store.capacity, selection.generation)
      }
      const raise = frame.raise ?? builtInRaise
      const forced = (index: number) => ((mask[index] ?? 0) & forcedStates) !== 0
      if (phase === 0 || phase === 1) {
        for (const index of frame.highlighted) {
          if (forced(index) === (phase === 0)) place(selection, frame, index, true)
        }
        return
      }
      if (phase === 2) {
        const alwaysBits = levelBits(flags, 0)
        for (const index of frame.always) {
          const own = mask[index] ?? 0
          if ((own & raise) !== 0 || (own & alwaysBits) === 0) continue
          if (labelLevel(own, flags, others) === labelAlways) place(selection, frame, index, false)
        }
        return
      }
      placeAll(selection, frame)
    },
  }
}
