function definedKeys(value: object, ignored: ReadonlySet<string> | null): string[] {
  return Object.keys(value).filter(
    (key) => (value as Record<string, unknown>)[key] !== undefined && !ignored?.has(key),
  )
}

export function shallowEqual(
  a: object,
  b: object,
  ignored: ReadonlySet<string> | null = null,
): boolean {
  if (a === b) return true
  const keys = definedKeys(a, ignored)
  if (keys.length !== definedKeys(b, ignored).length) return false
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}
