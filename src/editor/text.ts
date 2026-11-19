import { toAccessor } from '../core/accessor'
import { nodeLabelSize } from '../core/label-metrics'
import { positive, readWeight, toText } from '../core/label-text'
import { primaryWeight, type TextWidth } from '../core/label-width'
import { metersToWorld, wrapMargin, wrapText } from '../shapes/text'
import type { ShapeMark } from '../types'
import { type Bounds, boundsOf, geoOutline, type Outline, scaleOutline } from './geometry'

export const lineSpacing = 1.25
const atlasUnits = 24

export interface TextLook {
  readonly size: number
  readonly weight: number
  readonly font: string | null
  readonly wrap: boolean
  readonly world: boolean
}

type Options = ShapeMark<unknown>['options']

function read(value: unknown, datum: unknown, known: boolean): unknown {
  if (typeof value !== 'function') return value
  return known ? (value as (datum: unknown) => unknown)(datum) : undefined
}

export function labeled(options: Options): boolean {
  return options.label !== undefined
}

export function labelTextOf(options: Options, datum: unknown): string {
  const label = options.label
  if (label === undefined) return ''
  const field = typeof label === 'object' ? label.text : label
  return (
    toText(toAccessor<unknown, unknown>(field as string | ((datum: unknown) => unknown))(datum)) ??
    ''
  )
}

export function textLook(options: Options, datum: unknown, known: boolean): TextLook {
  const label = typeof options.label === 'object' ? options.label : null
  return {
    size: positive(read(label?.size, datum, known)) || nodeLabelSize,
    weight: readWeight(read(label?.weight, datum, known)) || primaryWeight,
    font: toText(read(label?.font, datum, known)) || null,
    wrap: read(label?.wrap, datum, known) === true,
    world: read(label?.scale, datum, known) === 'world',
  }
}

export function textPixels(look: TextLook, outline: Outline, oy: number, zoom: number): number {
  if (!look.world) return look.size * Math.min(1, zoom)
  const [, minY, , maxY] = boundsOf(outline)
  const size = geoOutline(outline) ? metersToWorld(look.size, (minY + maxY) / 2 + oy) : look.size
  return size * zoom
}

export function grownOutline(
  outline: Outline,
  text: string,
  look: TextLook,
  pixels: number,
  zoom: number,
  measure: TextWidth,
): Outline {
  if (outline.kind === 'circle' || !(pixels > 0) || !(zoom > 0)) return outline
  const box: Bounds = boundsOf(outline)
  const width = box[2] - box[0]
  const height = box[3] - box[1]
  const units = ((width * zoom) / pixels - wrapMargin * 2) * atlasUnits
  const lines = look.wrap
    ? wrapText(text, Math.max(units, atlasUnits), (part) => {
        return measure(part, look.weight, look.font) * atlasUnits
      }).split('\n').length
    : text.split('\n').length
  const needed = ((lines * lineSpacing + wrapMargin * 2) * pixels) / zoom
  if (!(height > 0) || needed <= height * (1 + 1e-9)) return outline
  return scaleOutline(outline, box[0], box[1], 1, needed / height)
}
