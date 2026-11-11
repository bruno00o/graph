import type { Key, Mark } from '../types'

/** Kind of the items of a mark: `'nodes'`, `'edges'` or `'shapes'`. */
export type ElementKind = 'nodes' | 'edges' | 'shapes'

/**
 * An item, or a change of a live source, whose key is neither a string nor a finite number. The
 * item is skipped. `K` is the kind of its mark.
 */
export interface MissingKeyIssue<K extends ElementKind = 'nodes' | 'edges'> {
  /** Type of the issue. */
  readonly type: 'missing-key'
  /** Kind of the mark that holds the item: `'nodes'`, `'edges'` or `'shapes'`. */
  readonly kind: K
  /** The item, as given to its mark, or the value of the change. */
  readonly datum: unknown
}

/**
 * A key that more than one item of the same kind holds. The first item wins, in mark order then
 * data order, and the others are skipped. `K` is the kind of the items.
 */
export interface DuplicateKeyIssue<K extends ElementKind = 'nodes' | 'edges'> {
  /** Type of the issue. */
  readonly type: 'duplicate-key'
  /** Kind of the items that share the key: `'nodes'`, `'edges'` or `'shapes'`. */
  readonly kind: K
  /** The shared key. */
  readonly key: Key
}

/**
 * Why a shape cannot be drawn as given: `'empty'` for a geometry that cannot be read or has no
 * area nor length, `'self-intersecting'` for a polygon whose rings cross, drawn as well as can be.
 */
export type InvalidShapeReason = 'empty' | 'self-intersecting'

/** A shape whose geometry cannot be read, or whose rings cross each other. */
export interface InvalidShapeIssue {
  /** Type of the issue. */
  readonly type: 'invalid-shape'
  /** Always `'shapes'`. */
  readonly kind: 'shapes'
  /** Key of the shape. */
  readonly key: Key
  /** Why the shape is invalid: `'empty'` or `'self-intersecting'`. */
  readonly reason: InvalidShapeReason
}

/** A problem with the data of a shape mark. */
export type ShapeIssue = MissingKeyIssue<'shapes'> | DuplicateKeyIssue<'shapes'> | InvalidShapeIssue

/** A node whose `parent` names no node. The node stays at the top level until that node comes. */
export interface MissingParentIssue {
  /** Type of the issue. */
  readonly type: 'missing-parent'
  /** Always `'nodes'`. */
  readonly kind: 'nodes'
  /** Key of the node. */
  readonly key: Key
  /** The parent key it names. */
  readonly parent: Key
}

/** A node whose `parent` would make it contain itself. The node stays at the top level. */
export interface ParentCycleIssue {
  /** Type of the issue. */
  readonly type: 'parent-cycle'
  /** Always `'nodes'`. */
  readonly kind: 'nodes'
  /** Key of the node. */
  readonly key: Key
  /** The parent key it names. */
  readonly parent: Key
}

/** An edge whose `supportedBy` names a key that is no edge drawn from the data. */
export interface MissingCarrierIssue {
  /** Type of the issue. */
  readonly type: 'missing-carrier'
  /** Always `'edges'`. */
  readonly kind: 'edges'
  /** Key of the carried edge. */
  readonly key: Key
  /** The carrier key it names. */
  readonly carrier: Key
}

/**
 * A problem present in the data. The graph draws around it, and it goes away once fixed. `M` is the
 * union of the marks: the problems of shapes are part of it when `M` has a shape mark, or is the
 * plain `Mark` type.
 */
export type GraphIssue<M extends Mark = Mark> =
  | MissingKeyIssue
  | DuplicateKeyIssue
  | MissingParentIssue
  | ParentCycleIssue
  | MissingCarrierIssue
  | (M extends { readonly type: 'nodes' | 'edges' } ? never : ShapeIssue)

export type AnyIssue = GraphIssue

const objectIds = new WeakMap<object, number>()
let nextObject = 0

function keyId(key: Key): string {
  return typeof key === 'number' ? `n${key}` : `s${key.length}:${key}`
}

function datumId(datum: unknown): string {
  if ((typeof datum !== 'object' || datum === null) && typeof datum !== 'function') {
    return `${typeof datum}:${String(datum)}`
  }
  let id = objectIds.get(datum)
  if (id === undefined) {
    id = ++nextObject
    objectIds.set(datum, id)
  }
  return `#${id}`
}

function issueId(issue: AnyIssue): string {
  const head = `${issue.type}|${issue.kind}|`
  switch (issue.type) {
    case 'missing-key':
      return head + datumId(issue.datum)
    case 'duplicate-key':
      return head + keyId(issue.key)
    case 'missing-parent':
    case 'parent-cycle':
      return `${head}${keyId(issue.key)}|${keyId(issue.parent)}`
    case 'missing-carrier':
      return `${head}${keyId(issue.key)}|${keyId(issue.carrier)}`
    case 'invalid-shape':
      return `${head}${keyId(issue.key)}|${issue.reason}`
  }
}

const noIssues: readonly AnyIssue[] = Object.freeze([])

export class IssueSet {
  #ids: Map<string, AnyIssue> = new Map()
  #list: readonly AnyIssue[] = noIssues

  get list(): readonly AnyIssue[] {
    return this.#list
  }

  refresh(found: readonly AnyIssue[]): AnyIssue[] | null {
    const next = new Map<string, AnyIssue>()
    const added: AnyIssue[] = []
    for (const issue of found) {
      const id = issueId(issue)
      if (next.has(id)) continue
      const known = this.#ids.get(id)
      if (known) next.set(id, known)
      else {
        next.set(id, issue)
        added.push(issue)
      }
    }
    if (added.length === 0 && next.size === this.#ids.size) return null
    this.#ids = next
    this.#list = next.size === 0 ? noIssues : Object.freeze([...next.values()])
    return added
  }

  clear(): void {
    this.#ids = new Map()
    this.#list = noIssues
  }
}

export function describeIssues(issues: readonly AnyIssue[]): string {
  const counts = new Map<string, number>()
  for (const issue of issues) counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1)
  const parts = [...counts].map(([type, count]) => `${count} ${type}`)
  const total = issues.length
  return `graph: ${total} new data ${total === 1 ? 'issue' : 'issues'} (${parts.join(', ')}); graph.issues() lists them`
}
