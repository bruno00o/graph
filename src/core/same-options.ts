const nestedLevels = 4

function isPlain(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return true
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function definedKeys(value: object, ignored: ReadonlySet<string> | null): string[] {
  return Object.keys(value).filter(
    (key) => (value as Record<string, unknown>)[key] !== undefined && !ignored?.has(key),
  )
}

function sameValue(a: unknown, b: unknown, levels: number): boolean {
  if (Object.is(a, b)) return true
  if (levels === 0 || !isPlain(a) || !isPlain(b)) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let at = 0; at < a.length; at++) {
      if (!sameValue(a[at], b[at], levels - 1)) return false
    }
    return true
  }
  return sameFields(a, b, null, levels - 1)
}

function sameFields(
  a: object,
  b: object,
  ignored: ReadonlySet<string> | null,
  levels: number,
): boolean {
  const keys = definedKeys(a, ignored)
  if (keys.length !== definedKeys(b, ignored).length) return false
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], levels),
  )
}

export function sameOptions(
  a: object,
  b: object,
  ignored: ReadonlySet<string> | null = null,
): boolean {
  return a === b || sameFields(a, b, ignored, nestedLevels)
}
