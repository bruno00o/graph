import type { Key } from '../types'

/**
 * An item, or a change of a live source, whose key is neither a string nor a finite number. The
 * item is skipped.
 */
export interface MissingKeyIssue {
  /** Type of the issue. */
  readonly type: 'missing-key'
  /** Kind of the mark that holds the item: `'nodes'` or `'edges'`. */
  readonly kind: 'nodes' | 'edges'
  /** The item, as given to its mark, or the value of the change. */
  readonly datum: unknown
}

/**
 * A key that more than one item of the same kind holds. The first item wins, in mark order then
 * data order, and the others are skipped.
 */
export interface DuplicateKeyIssue {
  /** Type of the issue. */
  readonly type: 'duplicate-key'
  /** Kind of the items that share the key: `'nodes'` or `'edges'`. */
  readonly kind: 'nodes' | 'edges'
  /** The shared key. */
  readonly key: Key
}

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

/** A problem present in the data. The graph draws around it, and it goes away once fixed. */
export type GraphIssue =
  | MissingKeyIssue
  | DuplicateKeyIssue
  | MissingParentIssue
  | ParentCycleIssue
  | MissingCarrierIssue

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

function issueId(issue: GraphIssue): string {
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
  }
}

const noIssues: readonly GraphIssue[] = Object.freeze([])

export class IssueSet {
  #ids: Map<string, GraphIssue> = new Map()
  #list: readonly GraphIssue[] = noIssues

  get list(): readonly GraphIssue[] {
    return this.#list
  }

  refresh(found: readonly GraphIssue[]): GraphIssue[] | null {
    const next = new Map<string, GraphIssue>()
    const added: GraphIssue[] = []
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

export function describeIssues(issues: readonly GraphIssue[]): string {
  const counts = new Map<string, number>()
  for (const issue of issues) counts.set(issue.type, (counts.get(issue.type) ?? 0) + 1)
  const parts = [...counts].map(([type, count]) => `${count} ${type}`)
  const total = issues.length
  return `graph: ${total} new data ${total === 1 ? 'issue' : 'issues'} (${parts.join(', ')}); graph.issues() lists them`
}
