import type { EdgeColumns, NodeColumns } from '../core/columns'
import { maxStates, noPaint, type StateBuffers } from '../core/state-buffers'

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
}

export const highlightMask = 7

const bits = new Uint32Array(1)
const float = new Float32Array(bits.buffer)

function wordFloat(word: number): number {
  bits[0] = word
  return float[0] ?? 0
}

function resolve(states: StateBuffers, mask: number, look: Look, table: number): Look {
  const { numbers, paint, labels } = states
  const base = look.opacity
  let found = 0
  let rest = mask >>> 0
  while (rest !== 0) {
    const bit = 31 - Math.clz32(rest & -rest)
    rest &= rest - 1
    const at = (table + bit) * 4
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
    },
    0,
  )
}

export function edgeLook(edges: EdgeColumns, states: StateBuffers, index: number): Look {
  return resolve(
    states,
    states.edgeMask[index] ?? 0,
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
    },
    maxStates,
  )
}
