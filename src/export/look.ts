import type { EdgeColumns, NodeColumns } from '../core/columns'
import type { ShapeStore } from '../core/shape-store'
import { noPaint, type StateBuffers, type StateKind, stateRow } from '../core/state-buffers'

export interface Look {
  opacity: number
  strokeWidth: number
  halo: boolean
  label: boolean
  fill: number
  stroke: number
  outline: number
  outlineWidth: number
  labelColor: number
  flow: number
}

const bits = new Uint32Array(1)
const float = new Float32Array(bits.buffer)

function wordFloat(word: number): number {
  bits[0] = word
  return float[0] ?? 0
}

function resolve(states: StateBuffers, mask: number, look: Look, kind: StateKind): Look {
  const { numbers, paint, labels } = states
  const base = look.opacity
  let found = 0
  let rest = (mask | states.others(kind)) >>> 0
  while (rest !== 0) {
    const bit = 31 - Math.clz32(rest & -rest)
    rest &= rest - 1
    const at = stateRow(kind, bit, ((mask >>> bit) & 1) === 1) * 4
    const opacity = numbers[at] ?? -1
    const strokeWidth = numbers[at + 1] ?? -1
    const halo = numbers[at + 2] ?? -1
    const label = numbers[at + 3] ?? -1
    if (!(found & 1) && opacity >= 0) {
      look.opacity = base * opacity
      found |= 1
    }
    if (!(found & 2) && strokeWidth >= 0) {
      look.strokeWidth = strokeWidth
      found |= 2
    }
    if (!(found & 4) && halo >= 0) {
      look.halo = halo > 0.5
      found |= 4
    }
    if (!(found & 8) && label >= 0) {
      look.label = label > 0.5
      found |= 8
    }
    const fill = paint[at] ?? noPaint
    if (!(found & 16) && fill !== noPaint) {
      look.fill = fill
      found |= 16
    }
    const stroke = paint[at + 1] ?? noPaint
    if (!(found & 32) && stroke !== noPaint) {
      look.stroke = stroke
      found |= 32
    }
    const outline = paint[at + 2] ?? noPaint
    if (!(found & 64) && outline !== noPaint) {
      look.outline = outline
      found |= 64
    }
    const outlineWidth = paint[at + 3] ?? noPaint
    if (!(found & 128) && outlineWidth !== noPaint) {
      look.outlineWidth = wordFloat(outlineWidth)
      found |= 128
    }
    const labelColor = labels[at] ?? noPaint
    if (!(found & 256) && labelColor !== noPaint) {
      look.labelColor = labelColor
      found |= 256
    }
    const flow = labels[at + 1] ?? noPaint
    if (!(found & 512) && flow !== noPaint) {
      look.flow = wordFloat(flow)
      found |= 512
    }
  }
  return look
}

export function nodeLook(nodes: NodeColumns, states: StateBuffers, index: number): Look {
  return resolve(
    states,
    states.nodeMask[index] ?? 0,
    {
      opacity: nodes.opacity[index] ?? 1,
      strokeWidth: nodes.strokeWidth[index] ?? 0,
      halo: false,
      label: true,
      fill: nodes.fill[index] ?? 0,
      stroke: nodes.stroke[index] ?? 0,
      outline: nodes.outline[index] ?? noPaint,
      outlineWidth: nodes.outlineWidth[index] ?? 0,
      labelColor: noPaint,
      flow: 0,
    },
    'nodes',
  )
}

export function shapeLook(shapes: ShapeStore, states: StateBuffers, index: number): Look {
  return resolve(
    states,
    states.shapeMask[index] ?? 0,
    {
      opacity: shapes.opacity[index] ?? 1,
      strokeWidth: shapes.strokeWidth[index] ?? 0,
      halo: false,
      label: false,
      fill: shapes.fill[index] ?? noPaint,
      stroke: shapes.stroke[index] ?? noPaint,
      outline: noPaint,
      outlineWidth: 0,
      labelColor: noPaint,
      flow: 0,
    },
    'shapes',
  )
}

export interface EdgeLine {
  readonly color: number
  readonly farColor: number
  readonly width: number
  readonly farWidth: number
  readonly dash: number
  readonly farDash: number
  readonly split: number
}

export function edgeLine(
  edges: EdgeColumns,
  states: StateBuffers,
  index: number,
  mask: number = states.edgeMask[index] ?? 0,
): EdgeLine {
  const probe = resolve(
    states,
    mask,
    {
      opacity: 1,
      strokeWidth: -1,
      halo: false,
      label: true,
      fill: noPaint,
      stroke: noPaint,
      outline: noPaint,
      outlineWidth: 0,
      labelColor: noPaint,
      flow: 0,
    },
    'edges',
  )
  const ends = edges.ends
  const split = ends !== null && ends.styled[index] === 1
  const painted = probe.stroke !== noPaint
  const sized = probe.strokeWidth >= 0
  const color = painted
    ? probe.stroke
    : split
      ? (ends.color[index * 2] ?? 0)
      : (edges.color[index] ?? 0)
  const width = Math.max(
    sized ? probe.strokeWidth : split ? (ends.width[index * 2] ?? 0) : (edges.width[index] ?? 0),
    0.5,
  )
  const dash = split ? (ends.dash[index * 2] ?? 0) : (edges.dash[index] ?? 0)
  return {
    color,
    farColor: painted || !split ? color : (ends.color[index * 2 + 1] ?? 0),
    width,
    farWidth: sized || !split ? width : Math.max(ends.width[index * 2 + 1] ?? 0, 0.5),
    dash,
    farDash: split ? (ends.dash[index * 2 + 1] ?? 0) : dash,
    split: split || ends?.halves[index] === 1 ? (ends?.split[index] ?? 0.5) : -1,
  }
}

export function edgeLook(
  edges: EdgeColumns,
  states: StateBuffers,
  index: number,
  mask: number = states.edgeMask[index] ?? 0,
): Look {
  return resolve(
    states,
    mask,
    {
      opacity: edges.opacity[index] ?? 1,
      strokeWidth: edges.width[index] ?? 0,
      halo: false,
      label: true,
      fill: noPaint,
      stroke: edges.color[index] ?? 0,
      outline: noPaint,
      outlineWidth: 0,
      labelColor: noPaint,
      flow: edges.flow[index] ?? 0,
    },
    'edges',
  )
}
