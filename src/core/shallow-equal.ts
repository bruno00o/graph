export function shallowEqual(a: object, b: object): boolean {
  if (a === b) return true
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  )
}
