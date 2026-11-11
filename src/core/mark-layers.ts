import type { Mark, MarkLayer } from '../types'

export const maxLayerSlots = 128

export interface LayerFilter {
  readonly nodes: Uint8Array
  readonly edges: Uint8Array
  readonly masks: Uint32Array
  readonly serial: number
}

const unlayered = Symbol('unlayered')

function layerOf(mark: Mark): MarkLayer {
  const layer = (mark as { readonly layer?: unknown }).layer
  return typeof layer === 'string' ? layer : undefined
}

function sameNumbers(a: ArrayLike<number> | null, b: ArrayLike<number> | null): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false
  return true
}

export class MarkLayers {
  names: readonly string[] = []
  nodeLayers: Int32Array = new Int32Array(0)
  edgeLayers: Int32Array = new Int32Array(0)
  edgeRanks: Uint16Array | null = null
  #filter: LayerFilter | null = null
  #hidden: string | null = ''
  #serial = 0

  get layered(): boolean {
    return this.names.length > 0
  }

  setMarks(marks: readonly Mark[]): boolean {
    const names: string[] = []
    const index = new Map<string, number>()
    const bands: (string | typeof unlayered)[] = []
    const nodeLayers: number[] = []
    const edgeLayers: number[] = []
    const edgeBands: number[] = []
    for (const mark of marks) {
      if (mark.type === 'shapes') continue
      const layer = layerOf(mark)
      let at = -1
      if (layer !== undefined) {
        at = index.get(layer) ?? -1
        if (at < 0) {
          at = names.length
          names.push(layer)
          index.set(layer, at)
        }
      }
      if (mark.type === 'nodes') {
        nodeLayers.push(at)
        continue
      }
      edgeLayers.push(at)
      const band = layer ?? unlayered
      let rank = bands.indexOf(band)
      if (rank < 0) {
        rank = bands.length
        bands.push(band)
      }
      edgeBands.push(rank)
    }
    const ranks = bands.length > 1 ? Uint16Array.from(edgeBands) : null
    const ranked = !sameNumbers(ranks, this.edgeRanks)
    const reshaped =
      ranked ||
      names.length !== this.names.length ||
      names.some((name, at) => name !== this.names[at]) ||
      !sameNumbers(nodeLayers, this.nodeLayers) ||
      !sameNumbers(edgeLayers, this.edgeLayers)
    if (reshaped) {
      this.names = Object.freeze(names)
      this.nodeLayers = Int32Array.from(nodeLayers)
      this.edgeLayers = Int32Array.from(edgeLayers)
      this.#filter = null
      this.#hidden = null
    }
    this.edgeRanks = ranks
    return ranked
  }

  filter(hidden: ReadonlySet<string>): LayerFilter | null {
    const key = this.names.filter((name) => hidden.has(name)).join('\u0000')
    if (key === this.#hidden) return this.#filter
    this.#hidden = key
    if (key === '') {
      this.#filter = null
      return null
    }
    const masks = new Uint32Array(8)
    const flags = (layers: Int32Array, offset: number): Uint8Array => {
      const out = new Uint8Array(layers.length)
      layers.forEach((layer, slot) => {
        const name = layer >= 0 ? this.names[layer] : undefined
        if (name === undefined || !hidden.has(name)) return
        out[slot] = 1
        if (slot < maxLayerSlots) {
          const word = offset + (slot >>> 5)
          masks[word] = ((masks[word] ?? 0) | (1 << (slot & 31))) >>> 0
        }
      })
      return out
    }
    this.#filter = {
      nodes: flags(this.nodeLayers, 0),
      edges: flags(this.edgeLayers, 4),
      masks,
      serial: ++this.#serial,
    }
    return this.#filter
  }
}
