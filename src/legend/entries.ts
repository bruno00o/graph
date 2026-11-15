import { containerShape } from '../core/columns'
import type { Scene } from '../core/scene'
import { edgeShown, nodeShown, type Sight, shapeShown } from '../core/visibility'
import { dev } from '../dev'
import { report } from '../host/isolate'
import type { EdgeDash, EdgeDatum, Key, Mark, NodeDatum, NodeShape, ShapeDatum } from '../types'

/** What a legend entry draws for its nodes: a shape, a fill, an outline or an image. */
export interface LegendNodeSwatch {
  /** Always `'nodes'`. */
  readonly kind: 'nodes'
  /** Shape of the symbol. Defaults to `'circle'`. */
  readonly shape?: NodeShape | undefined
  /** CSS color of the fill. Defaults to the node color of the theme. */
  readonly fill?: string | undefined
  /** CSS color of the outline, drawn inside the symbol. Defaults to no outline. */
  readonly stroke?: string | undefined
  /** URL of an image drawn in the symbol. */
  readonly image?: string | undefined
  /** CSS color the image is drawn in, or its own colors when left out. */
  readonly imageColor?: string | undefined
}

/** What a legend entry draws for its edges: a line with a color, a pattern and a width. */
export interface LegendEdgeSwatch {
  /** Always `'edges'`. */
  readonly kind: 'edges'
  /** CSS color of the line. Defaults to the edge color of the theme. */
  readonly color?: string | undefined
  /** Pattern of the line: `'solid'`, `'dashed'` or `'dotted'`. Defaults to `'solid'`. */
  readonly dash?: EdgeDash | undefined
  /** Width of the line in pixels, from 1 to 12. Defaults to 2. */
  readonly width?: number | undefined
}

/** What a legend entry draws for its shapes: an area or a line with a fill and an outline. */
export interface LegendShapeSwatch {
  /** Always `'shapes'`. */
  readonly kind: 'shapes'
  /** `'area'` draws a filled rectangle, `'line'` a line. Defaults to `'area'`. */
  readonly geometry?: 'area' | 'line' | undefined
  /** CSS color of the fill, or `null` for none. Defaults to the shape fill of the theme. */
  readonly fill?: string | null | undefined
  /** CSS color of the outline, or `null` for none. Defaults to the shape outline of the theme. */
  readonly stroke?: string | null | undefined
  /** Pattern of the outline: `'solid'`, `'dashed'` or `'dotted'`. Defaults to `'solid'`. */
  readonly dash?: EdgeDash | undefined
}

/** The symbol of a legend entry. Narrow on `kind`: `'nodes'`, `'edges'` or `'shapes'`. */
export type LegendSwatch = LegendNodeSwatch | LegendEdgeSwatch | LegendShapeSwatch

/**
 * An entry of a legend declared by the application: a label, a symbol, and optionally which
 * elements it stands for. `M` is the union of marks of the graph, which types the items.
 */
export interface LegendEntry<M extends Mark = Mark> {
  /**
   * Identifies the entry across updates and gives its item the id `a:` followed by this id. Unique
   * across the entries of a legend: a later entry with the same id is ignored.
   */
  readonly id: string
  /** Text of the entry. The legend writes no text of its own. */
  readonly label: string
  /** What the entry draws. */
  readonly swatch: LegendSwatch
  /**
   * Tells whether a node belongs to the entry, from its item and its key. Called once per item and
   * once more whenever the item changes, never for nodes that stay as they are: keep it pure, and
   * give a new function when its rule changes. A folded group is a node whose item is its
   * `NodeGroup`; unfolded groups are left out.
   */
  readonly nodes?: ((datum: NodeDatum<M>, key: Key) => boolean) | undefined
  /**
   * Tells whether an edge belongs to the entry, from its item and its key. An edge drawn for
   * several merged edges gives its `AggregateEdge`, and the entry covers all of them. Called like
   * `nodes`.
   */
  readonly edges?: ((datum: EdgeDatum<M>, key: Key) => boolean) | undefined
  /** Tells whether a shape belongs to the entry, from its item and its key. Called like `nodes`. */
  readonly shapes?: ((datum: ShapeDatum<M>, key: Key) => boolean) | undefined
}

/** A section of the entries of a legend, with its title. */
export interface LegendEntryGroup<M extends Mark = Mark> {
  /** Title of the section, or none. */
  readonly title?: string | undefined
  /** Entries of the section, in order. `only` switches off the others of the same section. */
  readonly entries: readonly LegendEntry<M>[]
}

/** An entry of the state of a legend. */
export interface LegendEntryItem {
  /** Identifies the item across updates: `a:` followed by the id of the entry. */
  readonly id: string
  /** Text of the entry. */
  readonly label: string
  /** What the entry draws. */
  readonly swatch: LegendSwatch
  /**
   * `true` when the entry tells which elements it covers: it then highlights them, switches them
   * off and counts them. `false` for an entry that is only displayed.
   */
  readonly interactive: boolean
  /** Number of nodes drawn that belong to the entry. */
  readonly nodes: number
  /** Number of edges drawn that belong to the entry. */
  readonly edges: number
  /** Number of shapes drawn that belong to the entry. */
  readonly shapes: number
  /** `true` while the item is switched off. */
  readonly off: boolean
}

/** A section of the entries in the state of a legend. */
export interface LegendEntrySection {
  /** Title of the section, or `undefined`. */
  readonly title: string | undefined
  /** Items of the section, in order. */
  readonly items: readonly LegendEntryItem[]
}

export const entryPrefix = 'a:'

type Kind = 'nodes' | 'edges' | 'shapes'
type Test = (datum: never, key: Key) => boolean

interface Rule {
  readonly bit: number
  readonly test: Test
}

interface Flat {
  readonly id: string
  readonly tests: readonly [Test | undefined, Test | undefined, Test | undefined]
}

interface Column {
  datums: unknown[]
  keys: unknown[]
  masks: Uint32Array
}

export interface EntryCounts {
  readonly nodes: Int32Array
  readonly edges: Int32Array
  readonly shapes: Int32Array
}

export interface EntryMatch {
  bits(ids: ReadonlySet<string>): Uint32Array | null
  covers(kind: Kind, index: number, bits: Uint32Array, validate: boolean): boolean
}

export type DatumAt = (kind: Kind, index: number) => unknown

const kinds: readonly Kind[] = ['nodes', 'edges', 'shapes']
const checkEvery = 256

interface Cursor {
  readonly kind: number
  readonly index: number
}

function column(): Column {
  return { datums: [], keys: [], masks: new Uint32Array(0) }
}

export type EntryGroups = readonly LegendEntryGroup<never>[]

function dedupe(groups: EntryGroups): EntryGroups {
  const seen = new Set<string>()
  return groups.map((group) => ({
    title: group.title,
    entries: group.entries.filter((entry) => {
      if (!seen.has(entry.id)) {
        seen.add(entry.id)
        return true
      }
      if (dev) console.warn(`legend: the entry id "${entry.id}" is used twice, the first one wins`)
      return false
    }),
  }))
}

function sameSwatch(a: LegendSwatch, b: LegendSwatch): boolean {
  const left = a as unknown as Record<string, unknown>
  const right = b as unknown as Record<string, unknown>
  const names = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const name of names) if (!Object.is(left[name], right[name])) return false
  return true
}

export function sameGroups(a: EntryGroups, b: EntryGroups): boolean {
  return (
    a.length === b.length &&
    a.every((group, at) => {
      const other = b[at]
      return (
        other !== undefined &&
        group.title === other.title &&
        group.entries.length === other.entries.length &&
        group.entries.every((entry, place) => {
          const twin = other.entries[place]
          return (
            twin !== undefined &&
            entry.id === twin.id &&
            entry.label === twin.label &&
            entry.nodes === twin.nodes &&
            entry.edges === twin.edges &&
            entry.shapes === twin.shapes &&
            sameSwatch(entry.swatch, twin.swatch)
          )
        })
      )
    })
  )
}

function sameRules(a: readonly Flat[], b: readonly Flat[]): boolean {
  return (
    a.length === b.length &&
    a.every((left, at) => {
      const right = b[at]
      return (
        right !== undefined &&
        left.id === right.id &&
        left.tests[0] === right.tests[0] &&
        left.tests[1] === right.tests[1] &&
        left.tests[2] === right.tests[2]
      )
    })
  )
}

export class EntryIndex implements EntryMatch {
  readonly #scene: Scene
  readonly #datumAt: DatumAt
  #flat: readonly Flat[] = []
  #sections: EntryGroups = []
  #bits = new Map<string, number>()
  #words = 0
  #rules: readonly (readonly Rule[])[] = [[], [], []]
  #columns: Column[] = [column(), column(), column()]
  #cursor: Cursor | null = null
  #work = 0
  #failed = false

  constructor(scene: Scene, datumAt: DatumAt) {
    this.#scene = scene
    this.#datumAt = datumAt
  }

  get size(): number {
    return this.#flat.length
  }

  get sections(): EntryGroups {
    return this.#sections
  }

  bitOf(id: string): number {
    return this.#bits.get(entryPrefix + id) ?? -1
  }

  set(groups: EntryGroups): boolean {
    this.#sections = dedupe(groups)
    const next: Flat[] = this.#sections.flatMap((group) =>
      group.entries.map((entry) => ({
        id: entry.id,
        tests: [
          entry.nodes as Test | undefined,
          entry.edges as Test | undefined,
          entry.shapes as Test | undefined,
        ] as const,
      })),
    )
    if (sameRules(next, this.#flat)) return false
    this.#flat = next
    this.#bits = new Map(next.map((entry, bit) => [entryPrefix + entry.id, bit]))
    this.#words = Math.ceil(next.length / 32)
    const rules: Rule[][] = [[], [], []]
    next.forEach((entry, bit) => {
      entry.tests.forEach((test, at) => {
        if (test) rules[at]?.push({ bit, test })
      })
    })
    this.#rules = rules
    this.#columns = [column(), column(), column()]
    this.#cursor = null
    this.#failed = false
    return true
  }

  bits(ids: ReadonlySet<string>): Uint32Array | null {
    if (this.#words === 0) return null
    let bits: Uint32Array | null = null
    for (const id of ids) {
      const bit = this.#bits.get(id)
      if (bit === undefined) continue
      bits ??= new Uint32Array(this.#words)
      bits[bit >>> 5] = (bits[bit >>> 5] ?? 0) | (1 << (bit & 31))
    }
    return bits
  }

  covers(kind: Kind, index: number, bits: Uint32Array, validate: boolean): boolean {
    const at = kinds.indexOf(kind)
    const words = this.#words
    let base = index * words
    if (validate) {
      if (!this.#alive(at, index)) return false
      base = this.#settle(at, index)
    }
    const { masks } = this.#columns[at] as Column
    if (base < 0 || base + words > masks.length) return false
    for (let word = 0; word < words; word++) {
      if (((masks[base + word] ?? 0) & (bits[word] ?? 0)) !== 0) return true
    }
    return false
  }

  count(sight: Sight, deadline: number): EntryCounts | null {
    const size = this.#flat.length
    this.#work = 0
    if (this.#cursor !== null) {
      this.#cursor = this.#pass(this.#cursor, null, null, deadline)
      if (this.#cursor !== null) return null
    }
    const counts: EntryCounts = {
      nodes: new Int32Array(size),
      edges: new Int32Array(size),
      shapes: new Int32Array(size),
    }
    this.#cursor = this.#pass(null, sight, counts, deadline)
    return this.#cursor === null ? counts : null
  }

  #alive(at: number, index: number): boolean {
    const { nodes, edges, shapes } = this.#scene
    return at === 0
      ? nodes.alive[index] === 1 && nodes.shape[index] !== containerShape
      : at === 1
        ? edges.alive[index] === 1
        : shapes.alive[index] === 1
  }

  #pass(from: Cursor | null, sight: Sight | null, counts: EntryCounts | null, deadline: number) {
    const { nodes, edges, shapes } = this.#scene
    const columns = [nodes, edges, shapes] as const
    const tallies = counts ? [counts.nodes, counts.edges, counts.shapes] : null
    let checked = this.#work
    const datumAt = this.#datumAt
    const words = this.#words
    for (let at = from?.kind ?? 0; at < 3; at++) {
      if ((this.#rules[at] as readonly Rule[]).length === 0) continue
      const store = columns[at] as (typeof columns)[number]
      const tally = tallies?.[at]
      const capacity = store.capacity
      const kind = kinds[at] as Kind
      const data = this.#columns[at] as Column
      const keys = store.keys
      for (let index = from && from.kind === at ? from.index : 0; index < capacity; index++) {
        if (this.#work - checked >= checkEvery) {
          checked = this.#work
          if (performance.now() > deadline) return { kind: at, index }
        }
        if (store.alive[index] !== 1) continue
        if (at === 0 && nodes.shape[index] === containerShape) continue
        if (sight) {
          const shown =
            at === 0
              ? nodeShown(nodes, index, sight)
              : at === 1
                ? edgeShown(nodes, edges, index, sight)
                : shapeShown(shapes, index, sight)
          if (!shown) continue
        }
        const datum = datumAt(kind, index)
        const base =
          datum !== undefined && data.datums[index] === datum && data.keys[index] === keys[index]
            ? index * words
            : this.#settle(at, index)
        if (tally && base >= 0) this.#add(tally, at, base)
      }
    }
    return null
  }

  #add(tally: Int32Array, at: number, base: number): void {
    const { masks } = this.#columns[at] as Column
    for (let word = 0; word < this.#words; word++) {
      let mask = masks[base + word] ?? 0
      while (mask !== 0) {
        const low = mask & -mask
        const bit = word * 32 + 31 - Math.clz32(low)
        tally[bit] = (tally[bit] ?? 0) + 1
        mask ^= low
      }
    }
  }

  #settle(at: number, index: number): number {
    const rules = this.#rules[at] as readonly Rule[]
    if (rules.length === 0) return -1
    const datum = this.#datumAt(kinds[at] as Kind, index)
    if (datum === undefined) return -1
    const scene = this.#scene
    const key = (at === 0 ? scene.nodes : at === 1 ? scene.edges : scene.shapes).keys[index]
    const data = this.#columns[at] as Column
    const words = this.#words
    const base = index * words
    if (data.datums[index] === datum && data.keys[index] === key) return base
    if (data.masks.length < base + words) {
      const grown = new Uint32Array(Math.max(base + words, data.masks.length * 2))
      grown.set(data.masks)
      data.masks = grown
    }
    for (let word = 0; word < words; word++) data.masks[base + word] = 0
    for (const rule of rules) {
      if (this.#test(rule.test, datum, key as Key)) {
        const place = base + (rule.bit >>> 5)
        data.masks[place] = (data.masks[place] ?? 0) | (1 << (rule.bit & 31))
      }
    }
    data.datums[index] = datum
    data.keys[index] = key
    this.#work++
    return base
  }

  #test(test: Test, datum: unknown, key: Key): boolean {
    try {
      return test(datum as never, key) === true
    } catch (error) {
      if (!this.#failed) {
        this.#failed = true
        report(error)
      }
      return false
    }
  }
}
