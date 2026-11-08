export type IntegerMode =
  | 'safe'
  | 'number'
  | 'string'
  | 'bigint'
  | 'keep'
  | ((value: bigint) => unknown)

const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
const minSafe = BigInt(Number.MIN_SAFE_INTEGER)

interface IntegerLike {
  readonly low: number
  readonly high: number
}

interface Dictionary {
  readonly [key: string]: unknown
  readonly low?: unknown
  readonly high?: unknown
  readonly toNumber?: unknown
  readonly timeZoneOffsetSeconds?: unknown
  readonly timeZoneId?: unknown
  readonly srid?: unknown
  readonly x?: unknown
  readonly y?: unknown
  readonly z?: unknown
}

function isInt32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && (value | 0) === value
}

export function isObject(value: unknown): value is Dictionary {
  return typeof value === 'object' && value !== null
}

export function isIntegerLike(value: unknown): value is IntegerLike {
  if (!isObject(value)) return false
  if (!isInt32(value.low) || !isInt32(value.high)) return false
  return typeof value.toNumber === 'function' || Object.keys(value).length === 2
}

function fromParts(value: IntegerLike): bigint {
  return (BigInt(value.high) << 32n) | BigInt(value.low >>> 0)
}

function convertBigInt(value: bigint, mode: IntegerMode): unknown {
  if (typeof mode === 'function') return mode(value)
  if (mode === 'string') return value.toString()
  if (mode === 'bigint') return value
  if (mode === 'number') return Number(value)
  return value <= maxSafe && value >= minSafe ? Number(value) : value.toString()
}

export function convertInteger(value: IntegerLike | bigint, mode: IntegerMode): unknown {
  if (mode === 'keep') return value
  return convertBigInt(typeof value === 'bigint' ? value : fromParts(value), mode)
}

export function integerText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'bigint') return value.toString()
  if (isIntegerLike(value)) return fromParts(value).toString()
  return undefined
}

function count(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (isIntegerLike(value)) return Number(fromParts(value))
  return undefined
}

function counts(value: Dictionary, names: readonly string[]): number[] | undefined {
  const out: number[] = []
  for (const name of names) {
    const number = count(value[name])
    if (number === undefined) return undefined
    out.push(number)
  }
  return out
}

function onlyKeys(value: Dictionary, allowed: readonly string[]): boolean {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return false
  return true
}

function pad(value: number, width: number): string {
  return String(Math.abs(value)).padStart(width, '0')
}

function formatYear(year: number): string {
  if (year >= 0 && year <= 9999) return pad(year, 4)
  return (year < 0 ? '-' : '+') + pad(year, 6)
}

function formatDate(year: number, month: number, day: number): string {
  return `${formatYear(year)}-${pad(month, 2)}-${pad(day, 2)}`
}

function formatTime(hour: number, minute: number, second: number, nanosecond: number): string {
  const base = `${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`
  return nanosecond === 0 ? base : `${base}.${pad(nanosecond, 9)}`
}

function formatOffset(seconds: number): string {
  if (seconds === 0) return 'Z'
  const sign = seconds < 0 ? '-' : '+'
  const total = Math.abs(seconds)
  const base = `${sign}${pad(Math.trunc(total / 3600), 2)}:${pad(Math.trunc((total % 3600) / 60), 2)}`
  return total % 60 === 0 ? base : `${base}:${pad(total % 60, 2)}`
}

const dateFields = ['year', 'month', 'day'] as const
const timeFields = ['hour', 'minute', 'second', 'nanosecond'] as const
const dateTimeFields = [...dateFields, ...timeFields] as const
const zoneFields = ['timeZoneOffsetSeconds', 'timeZoneId'] as const

function dateTime(value: Dictionary): string | undefined {
  const parts = counts(value, dateTimeFields)
  if (!parts || !onlyKeys(value, [...dateTimeFields, ...zoneFields])) return undefined
  const [year, month, day, hour, minute, second, nanosecond] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const local = `${formatDate(year, month, day)}T${formatTime(hour, minute, second, nanosecond)}`
  const seconds = count(value.timeZoneOffsetSeconds)
  const zone = typeof value.timeZoneId === 'string' ? `[${value.timeZoneId}]` : ''
  return `${local}${seconds === undefined ? '' : formatOffset(seconds)}${zone}`
}

function time(value: Dictionary): string | undefined {
  const parts = counts(value, timeFields)
  if (!parts || !onlyKeys(value, [...timeFields, 'timeZoneOffsetSeconds'])) return undefined
  const [hour, minute, second, nanosecond] = parts as [number, number, number, number]
  const local = formatTime(hour, minute, second, nanosecond)
  const seconds = count(value.timeZoneOffsetSeconds)
  return seconds === undefined ? local : `${local}${formatOffset(seconds)}`
}

function date(value: Dictionary): string | undefined {
  const parts = counts(value, dateFields)
  if (!parts || !onlyKeys(value, dateFields)) return undefined
  return formatDate(parts[0] as number, parts[1] as number, parts[2] as number)
}

function temporal(value: Dictionary): string | undefined {
  if ('year' in value) return 'hour' in value ? dateTime(value) : date(value)
  if ('hour' in value) return time(value)
  return undefined
}

const durationFields = ['months', 'days', 'seconds', 'nanoseconds'] as const

function duration(value: Dictionary): Dictionary | undefined {
  if (!durationFields.every((name) => name in value) || !onlyKeys(value, durationFields)) {
    return undefined
  }
  const parts = counts(value, durationFields)
  if (!parts) return undefined
  return { months: parts[0], days: parts[1], seconds: parts[2], nanoseconds: parts[3] }
}

function point(value: Dictionary, mode: IntegerMode): Dictionary | undefined {
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return undefined
  const srid = integerText(value.srid)
  if (srid === undefined || typeof value.srid === 'string') return undefined
  if (!onlyKeys(value, ['srid', 'x', 'y', 'z'])) return undefined
  const out = {
    srid: mode === 'keep' ? value.srid : convertInteger(BigInt(srid), mode),
    x: value.x,
    y: value.y,
  }
  return typeof value.z === 'number' ? { ...out, z: value.z } : out
}

function isPlain(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function convertValue(value: unknown, mode: IntegerMode): unknown {
  if (typeof value === 'bigint') return convertInteger(value, mode)
  if (!isObject(value)) return value
  if (Array.isArray(value)) return value.map((item) => convertValue(item, mode))
  if (isIntegerLike(value)) return convertInteger(value, mode)
  if (ArrayBuffer.isView(value) || value instanceof Date || value instanceof Map) return value
  const spatial = point(value, mode)
  if (spatial) return spatial
  const text = temporal(value)
  if (text !== undefined) return text
  const span = duration(value)
  if (span) return span
  if (!isPlain(value)) return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value)) out[key] = convertValue(value[key], mode)
  return out
}
