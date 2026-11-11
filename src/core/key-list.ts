import { dev } from '../dev'

export type StringCheck = (value: unknown, method: string) => void

export interface KeyLists {
  readonly nodes?: unknown
  readonly edges?: unknown
  readonly shapes?: unknown
}

function silent(): void {}

export function stringCheck(): StringCheck {
  if (!dev) return silent
  const warned = new Set<string>()
  return (value, method) => {
    if (typeof value !== 'string' || warned.has(method)) return
    warned.add(method)
    console.warn(`graph: ${method} takes a list of keys, not a string`)
  }
}

export function checkLists(
  check: StringCheck,
  input: KeyLists | null | undefined,
  method: string,
): void {
  if (!input || typeof input !== 'object') return
  check(input.nodes, method.replace('$', 'nodes'))
  check(input.edges, method.replace('$', 'edges'))
  if (input.shapes !== undefined) check(input.shapes, method.replace('$', 'shapes'))
}
