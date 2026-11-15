export const allTime: Float64Array = Float64Array.of(
  Number.NEGATIVE_INFINITY,
  Number.POSITIVE_INFINITY,
)

export const noTime: Float64Array = new Float64Array(0)

let first: Float64Array = new Float64Array(16)
let second: Float64Array = new Float64Array(16)

function room(buffer: Float64Array, size: number): Float64Array {
  return buffer.length >= size ? buffer : new Float64Array(Math.max(size, buffer.length * 2))
}

function meet(
  a: Float64Array,
  aSize: number,
  b: Float64Array,
  bSize: number,
  out: Float64Array,
  strict: boolean,
): number {
  let size = 0
  let i = 0
  let j = 0
  while (i + 1 < aSize && j + 1 < bSize) {
    const aStart = a[i] ?? 0
    const aEnd = a[i + 1] ?? 0
    const bStart = b[j] ?? 0
    const bEnd = b[j + 1] ?? 0
    const start = Math.max(aStart, bStart)
    const end = Math.min(aEnd, bEnd)
    if (
      (end > start ||
        (end === start &&
          (!strict || ((aStart === aEnd || aEnd > end) && (bStart === bEnd || bEnd > end))))) &&
      (size === 0 || out[size - 2] !== start || out[size - 1] !== end)
    ) {
      out[size++] = start
      out[size++] = end
    }
    if (aEnd < bEnd || (aEnd === bEnd && aStart < aEnd)) i += 2
    else j += 2
  }
  return size
}

function result(buffer: Float64Array, size: number): Float64Array {
  if (size === 0) return noTime
  if (
    size === 2 &&
    buffer[0] === Number.NEGATIVE_INFINITY &&
    buffer[1] === Number.POSITIVE_INFINITY
  ) {
    return allTime
  }
  return buffer.slice(0, size)
}

export function intersectPeriods(a: Float64Array, b: Float64Array, strict = false): Float64Array {
  if (a === allTime) return b
  if (b === allTime) return a
  first = room(first, a.length + b.length)
  return result(first, meet(a, a.length, b, b.length, first, strict))
}

export function intersectThree(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  strict = false,
): Float64Array {
  if (a === allTime) return intersectPeriods(b, c, strict)
  if (b === allTime) return intersectPeriods(a, c, strict)
  if (c === allTime) return intersectPeriods(a, b, strict)
  first = room(first, a.length + b.length)
  const size = meet(a, a.length, b, b.length, first, strict)
  second = room(second, size + c.length)
  return result(second, meet(first, size, c, c.length, second, strict))
}
