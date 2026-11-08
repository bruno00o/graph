import { failAt } from './errors'
import type { GraphFormat } from './types'

export interface XmlElement {
  readonly name: string
  readonly attributes: readonly string[]
  children: XmlElement[]
  text: string
  readonly offset: number
}

const noChildren: XmlElement[] = []

const lt = 60
const gt = 62
const slash = 47
const bang = 33
const question = 63
const equals = 61
const quote = 34
const apostrophe = 39
const colon = 58

function isSpace(code: number): boolean {
  return code === 32 || code === 10 || code === 9 || code === 13
}

function isNameEnd(code: number): boolean {
  return (
    code === 32 ||
    code === 10 ||
    code === 9 ||
    code === 13 ||
    code === slash ||
    code === gt ||
    code === equals ||
    code === lt ||
    code === quote ||
    code === apostrophe ||
    Number.isNaN(code)
  )
}

function isNameStart(code: number): boolean {
  return !(isNameEnd(code) || (code >= 48 && code <= 57) || code === 45 || code === 46)
}

function blank(text: string, from: number, to: number): boolean {
  for (let index = from; index < to; index++) {
    if (!isSpace(text.charCodeAt(index))) return false
  }
  return true
}

function localName(name: string): string {
  const index = name.indexOf(':')
  return index === -1 ? name : name.slice(index + 1)
}

const predefined: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  apos: "'",
  quot: '"',
}

function decode(format: GraphFormat, source: string, value: string, offset: number): string {
  let result = ''
  let start = 0
  let index = value.indexOf('&')
  while (index !== -1) {
    const end = value.indexOf(';', index)
    if (end === -1 || end - index > 12) failAt(format, source, offset, 'malformed entity reference')
    const name = value.slice(index + 1, end)
    let piece: string | undefined
    if (name.charCodeAt(0) === 35) {
      const hex = name.charCodeAt(1) === 120
      const digits = name.slice(hex ? 2 : 1)
      const valid = hex ? /^[0-9a-fA-F]+$/.test(digits) : /^[0-9]+$/.test(digits)
      const code = valid ? Number.parseInt(digits, hex ? 16 : 10) : Number.NaN
      if (
        Number.isNaN(code) ||
        code === 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)
      ) {
        failAt(format, source, offset, `invalid character reference &${name};`)
      }
      piece = String.fromCodePoint(code)
    } else {
      piece = predefined[name]
      if (piece === undefined) failAt(format, source, offset, `unknown entity &${name};`)
    }
    result += value.slice(start, index) + piece
    start = end + 1
    index = value.indexOf('&', start)
  }
  return start === 0 ? value : result + value.slice(start)
}

function normalizeText(value: string): string {
  return value.indexOf('\r') === -1 ? value : value.replace(/\r\n?/g, '\n')
}

function normalizeAttribute(value: string): string {
  return /[\t\n\r]/.test(value) ? value.replace(/\r\n?|[\t\n]/g, ' ') : value
}

function skipDoctype(format: GraphFormat, text: string, start: number): number {
  let index = start + 9
  let quoteCode = 0
  let depth = 0
  for (; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (quoteCode !== 0) {
      if (code === quoteCode) quoteCode = 0
    } else if (code === quote || code === apostrophe) {
      quoteCode = code
    } else if (code === 91) {
      depth += 1
    } else if (code === 93) {
      depth -= 1
    } else if (code === gt && depth <= 0) {
      return index + 1
    }
  }
  return failAt(format, text, start, 'unterminated document type declaration')
}

export function parseXml(format: GraphFormat, text: string): XmlElement {
  const length = text.length
  const stack: XmlElement[] = []
  const names: string[] = []
  let root: XmlElement | undefined
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0

  const appendText = (from: number, to: number, raw: boolean) => {
    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      if (!raw && blank(text, from, to)) return
      failAt(format, text, from, 'text outside the root element')
    }
    if (!raw && parent.children !== noChildren && blank(text, from, to)) return
    let value = normalizeText(text.slice(from, to))
    if (!raw && value.indexOf('&') !== -1) value = decode(format, text, value, from)
    parent.text += value
  }

  while (index < length) {
    const open = text.indexOf('<', index)
    if (open === -1) {
      appendText(index, length, false)
      index = length
      break
    }
    if (open > index) appendText(index, open, false)
    const next = text.charCodeAt(open + 1)
    if (next === slash) {
      let end = open + 2
      while (!isNameEnd(text.charCodeAt(end))) end++
      const name = text.slice(open + 2, end)
      while (isSpace(text.charCodeAt(end))) end++
      if (text.charCodeAt(end) !== gt) failAt(format, text, end, "expected '>'")
      const expected = names.pop()
      if (expected === undefined) failAt(format, text, open, `unexpected closing tag </${name}>`)
      if (expected !== name) {
        failAt(format, text, open, `expected </${expected}>, found </${name}>`)
      }
      const element = stack.pop() as XmlElement
      if (element.children !== noChildren && blank(element.text, 0, element.text.length)) {
        element.text = ''
      }
      index = end + 1
      continue
    }
    if (next === bang) {
      if (text.startsWith('<!--', open)) {
        const end = text.indexOf('-->', open + 4)
        if (end === -1) failAt(format, text, open, 'unterminated comment')
        index = end + 3
      } else if (text.startsWith('<![CDATA[', open)) {
        const end = text.indexOf(']]>', open + 9)
        if (end === -1) failAt(format, text, open, 'unterminated CDATA section')
        if (stack.length === 0) failAt(format, text, open, 'CDATA outside the root element')
        appendText(open + 9, end, true)
        index = end + 3
      } else if (text.startsWith('<!DOCTYPE', open)) {
        if (root !== undefined || stack.length > 0) {
          failAt(format, text, open, 'misplaced document type declaration')
        }
        index = skipDoctype(format, text, open)
      } else {
        failAt(format, text, open, 'unexpected markup')
      }
      continue
    }
    if (next === question) {
      const end = text.indexOf('?>', open + 2)
      if (end === -1) failAt(format, text, open, 'unterminated processing instruction')
      index = end + 2
      continue
    }
    if (!isNameStart(next)) failAt(format, text, open + 1, 'expected an element name')
    let cursor = open + 1
    while (!isNameEnd(text.charCodeAt(cursor))) cursor++
    const qualified = text.slice(open + 1, cursor)
    const attributes: string[] = []
    let closed = false
    for (;;) {
      const before = cursor
      while (isSpace(text.charCodeAt(cursor))) cursor++
      const code = text.charCodeAt(cursor)
      if (code === gt) {
        cursor++
        break
      }
      if (code === slash) {
        if (text.charCodeAt(cursor + 1) !== gt) failAt(format, text, cursor, "expected '/>'")
        cursor += 2
        closed = true
        break
      }
      if (Number.isNaN(code)) failAt(format, text, open, `unterminated tag <${qualified}>`)
      if (cursor === before || !isNameStart(code)) {
        failAt(format, text, cursor, 'expected an attribute name')
      }
      const nameStart = cursor
      while (!isNameEnd(text.charCodeAt(cursor))) cursor++
      const attribute = text.slice(nameStart, cursor)
      while (isSpace(text.charCodeAt(cursor))) cursor++
      if (text.charCodeAt(cursor) !== equals) failAt(format, text, cursor, "expected '='")
      cursor++
      while (isSpace(text.charCodeAt(cursor))) cursor++
      const delimiter = text.charCodeAt(cursor)
      if (delimiter !== quote && delimiter !== apostrophe) {
        failAt(format, text, cursor, 'expected a quoted attribute value')
      }
      const valueEnd = text.indexOf(delimiter === quote ? '"' : "'", cursor + 1)
      if (valueEnd === -1) failAt(format, text, cursor, 'unterminated attribute value')
      let value = text.slice(cursor + 1, valueEnd)
      if (value.indexOf('<') !== -1) failAt(format, text, cursor, "'<' in an attribute value")
      value = normalizeAttribute(value)
      if (value.indexOf('&') !== -1) value = decode(format, text, value, cursor)
      cursor = valueEnd + 1
      if (attribute === 'xmlns' || attribute.startsWith('xmlns:')) continue
      const name = attribute.charCodeAt(0) !== colon ? localName(attribute) : attribute
      for (let other = 0; other < attributes.length; other += 2) {
        if (attributes[other] === name)
          failAt(format, text, nameStart, `duplicate attribute ${name}`)
      }
      attributes.push(name, value)
    }
    const element: XmlElement = {
      name: localName(qualified),
      attributes,
      children: noChildren,
      text: '',
      offset: open,
    }
    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      if (root !== undefined) failAt(format, text, open, 'more than one root element')
      root = element
    } else {
      if (parent.children === noChildren) {
        parent.children = []
        if (blank(parent.text, 0, parent.text.length)) parent.text = ''
      }
      parent.children.push(element)
    }
    if (!closed) {
      stack.push(element)
      names.push(qualified)
    }
    index = cursor
  }
  if (stack.length > 0) {
    const last = stack[stack.length - 1] as XmlElement
    failAt(format, text, last.offset, `unclosed element <${names[names.length - 1]}>`)
  }
  if (root === undefined) failAt(format, text, length, 'no root element')
  return root
}

export function attributeOf(element: XmlElement, name: string): string | undefined {
  const attributes = element.attributes
  for (let index = 0; index < attributes.length; index += 2) {
    if (attributes[index] === name) return attributes[index + 1]
  }
  return undefined
}

export function escapeText(value: string): string {
  return /[&<>\r]/.test(value)
    ? value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r/g, '&#13;')
    : value
}

export function escapeAttribute(value: string): string {
  return /[&<>"\t\n\r]/.test(value)
    ? value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\t/g, '&#9;')
        .replace(/\n/g, '&#10;')
        .replace(/\r/g, '&#13;')
    : value
}

function allowed(code: number, next: number, previous: number): boolean {
  if (code < 32) return code === 9 || code === 10 || code === 13
  if (code >= 0xd800 && code <= 0xdbff) return next >= 0xdc00 && next <= 0xdfff
  if (code >= 0xdc00 && code <= 0xdfff) return previous >= 0xd800 && previous <= 0xdbff
  return code !== 0xfffe && code !== 0xffff
}

export function xmlSafe(value: string): string {
  let result: string | undefined
  let start = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code >= 32 && code < 0xd800) continue
    if (allowed(code, value.charCodeAt(index + 1), value.charCodeAt(index - 1))) continue
    result = (result ?? '') + value.slice(start, index) + String.fromCharCode(0xfffd)
    start = index + 1
  }
  return result === undefined ? value : result + value.slice(start)
}
