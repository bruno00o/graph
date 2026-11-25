import { readGroupKey } from '../core/group-index'
import type { GraphCore } from '../host/graph-instance'
import type { Key } from '../types'
import type { AgentKey } from './types'

export function readKey(key: unknown): AgentKey {
  const parts = readGroupKey(key)
  if (!parts) return key as Key
  const value = readKey(parts.value)
  if (parts.parent === undefined) return { group: { name: parts.name, value } }
  return { group: { name: parts.name, value, parent: readKey(parts.parent) } }
}

export function readKeys(keys: readonly Key[], most = 50): AgentKey[] {
  const out: AgentKey[] = []
  for (const key of keys) {
    if (out.length >= most) break
    out.push(readKey(key))
  }
  return out
}

function isGroupKey(value: unknown): value is { readonly group: Record<string, unknown> } {
  if (typeof value !== 'object' || value === null) return false
  const group = (value as { group?: unknown }).group
  return typeof group === 'object' && group !== null
}

export function writeKey(graph: GraphCore, key: unknown): Key | null {
  if (typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key))) return key
  if (!isGroupKey(key)) return null
  const { name, value, parent } = key.group
  if (typeof name !== 'string') return null
  const own = writeKey(graph, value)
  if (own === null) return null
  if (parent === undefined || parent === null) return graph.groups.keyOf(name, own)
  const above = writeKey(graph, parent)
  return above === null ? null : graph.groups.keyOf(name, own, above)
}

export function folded(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function timeOut(value: number | null): string | number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.abs(value) > 1e11 ? new Date(value).toISOString() : value
}

export function rounded(value: number, digits = 1): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
