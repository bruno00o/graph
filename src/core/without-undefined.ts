type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> }

export function withoutUndefined<T extends object>(value: T): Defined<T> {
  const copy: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    const entry = (value as Record<string, unknown>)[key]
    if (entry !== undefined) copy[key] = entry
  }
  return copy as Defined<T>
}
