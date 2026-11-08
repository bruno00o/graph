import type { AttributeType, AttributeValue } from './types'

export type ScalarType = 'string' | 'boolean' | 'integer' | 'long' | 'float' | 'double'

export function isListType(type: AttributeType): boolean {
  return type.endsWith('[]')
}

export function elementType(type: AttributeType): ScalarType {
  return (type.endsWith('[]') ? type.slice(0, -2) : type) as ScalarType
}

const integerText = /^[+-]?\d+$/
const minInteger = -2147483648
const maxInteger = 2147483647

export function parseInteger(text: string): number | string | undefined {
  const trimmed = text.trim()
  if (!integerText.test(trimmed)) return undefined
  const value = Number(trimmed)
  if (Number.isSafeInteger(value)) return value === 0 ? 0 : value
  const digits = trimmed.replace(/^\+/, '').replace(/^(-?)0+(?=\d)/, '$1')
  return digits
}

export function parseDecimal(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === 'INF' || trimmed === '+INF') return Number.POSITIVE_INFINITY
  if (trimmed === '-INF') return Number.NEGATIVE_INFINITY
  if (trimmed === 'NaN') return Number.NaN
  if (trimmed === '' || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return undefined
  return Number(trimmed)
}

export function parseBoolean(text: string): boolean | undefined {
  const trimmed = text.trim().toLowerCase()
  if (trimmed === 'true' || trimmed === '1') return true
  if (trimmed === 'false' || trimmed === '0') return false
  return undefined
}

export function parseScalar(type: ScalarType, text: string): AttributeValue | undefined {
  switch (type) {
    case 'string':
      return text
    case 'boolean':
      return parseBoolean(text)
    case 'integer':
    case 'long':
      return parseInteger(text)
    case 'float':
    case 'double':
      return parseDecimal(text)
  }
}

export function formatNumber(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return 'INF'
  if (value === Number.NEGATIVE_INFINITY) return '-INF'
  return String(value)
}

export function formatScalar(value: AttributeValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return JSON.stringify(value)
}

function scalarFits(type: ScalarType, value: AttributeValue): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
    case 'long':
      return Number.isInteger(value) || (typeof value === 'string' && integerText.test(value))
    case 'float':
    case 'double':
      return typeof value === 'number'
  }
}

export function fits(type: AttributeType, value: AttributeValue): boolean {
  if (!isListType(type)) return scalarFits(type as ScalarType, value)
  if (!Array.isArray(value)) return false
  const element = elementType(type)
  return value.every((item: AttributeValue) => scalarFits(element, item))
}

function scalarTypeOf(value: AttributeValue): ScalarType | 'other' {
  switch (typeof value) {
    case 'string':
      return 'string'
    case 'boolean':
      return 'boolean'
    case 'number':
      if (!Number.isInteger(value)) return 'double'
      return value >= minInteger && value <= maxInteger ? 'integer' : 'long'
    default:
      return 'other'
  }
}

function widen(current: ScalarType | 'other' | undefined, next: ScalarType | 'other') {
  if (current === undefined || current === next) return next
  const numbers = ['integer', 'long', 'double']
  if (numbers.includes(current) && numbers.includes(next)) {
    return numbers[Math.max(numbers.indexOf(current), numbers.indexOf(next))] as ScalarType
  }
  return 'other'
}

export class TypeGuess {
  #scalar: ScalarType | 'other' | undefined
  #list: ScalarType | 'other' | undefined
  #lists = 0
  #scalars = 0

  add(value: AttributeValue): void {
    if (Array.isArray(value)) {
      this.#lists += 1
      for (const item of value as readonly AttributeValue[]) {
        this.#list = widen(this.#list, scalarTypeOf(item))
      }
    } else {
      this.#scalars += 1
      this.#scalar = widen(this.#scalar, scalarTypeOf(value))
    }
  }

  type(): AttributeType {
    if (this.#lists > 0 && this.#scalars === 0) {
      const element = this.#list ?? 'string'
      return element === 'other' ? 'string' : (`${element}[]` as AttributeType)
    }
    if (this.#lists > 0) return 'string'
    const scalar = this.#scalar ?? 'string'
    return scalar === 'other' ? 'string' : scalar
  }
}

export function sameValue(a: AttributeValue | undefined, b: AttributeValue | undefined): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]))
  }
  return false
}

export function setField(target: Record<string, unknown>, name: string, value: unknown): void {
  if (name === '__proto__') {
    Object.defineProperty(target, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  } else {
    target[name] = value
  }
}

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function toAttributeValue(value: unknown): AttributeValue | undefined {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return value
    case 'bigint':
      return Number.isSafeInteger(Number(value)) ? Number(value) : String(value)
    case 'object': {
      if (value === null) return null
      if (value instanceof Date) {
        const time = value.getTime()
        return Number.isNaN(time) ? undefined : value.toISOString()
      }
      if (Array.isArray(value)) {
        const items: AttributeValue[] = []
        for (const item of value) {
          const converted = toAttributeValue(item)
          items.push(converted === undefined ? null : converted)
        }
        return items
      }
      if (isPlainObject(value)) {
        const result: Record<string, AttributeValue> = {}
        for (const name of Object.keys(value)) {
          const converted = toAttributeValue(value[name])
          if (converted !== undefined) setField(result, name, converted)
        }
        return result
      }
      return String(value)
    }
    default:
      return undefined
  }
}
