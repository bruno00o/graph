export function shallowEqual(
  a: object,
  b: object,
  ignored: ReadonlySet<string> | null = null,
): boolean {
  if (a === b) return true
  const keys = Object.keys(a).filter((key) => !ignored?.has(key))
  if (keys.length !== Object.keys(b).filter((key) => !ignored?.has(key)).length) return false
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}
