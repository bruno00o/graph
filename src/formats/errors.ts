import type { GraphFormat } from './types'

/** A file that cannot be read at all. The message names the format and the position. */
export class FormatError extends Error {
  /** Format being read. */
  readonly format: GraphFormat
  /** Line of the problem, from 1, when the file has one. */
  readonly line: number | undefined
  /** Column of the problem, from 1, when the file has one. */
  readonly column: number | undefined

  constructor(format: GraphFormat, message: string, line?: number, column?: number) {
    super(
      line === undefined
        ? `${format}: ${message}`
        : `${format}: ${message} at line ${line}, column ${column ?? 1}`,
    )
    this.name = 'FormatError'
    this.format = format
    this.line = line
    this.column = column
  }
}

export function positionOf(text: string, offset: number): { line: number; column: number } {
  let line = 1
  let start = 0
  let next = text.indexOf('\n', 0)
  while (next !== -1 && next < offset) {
    line += 1
    start = next + 1
    next = text.indexOf('\n', start)
  }
  return { line, column: offset - start + 1 }
}

export function failAt(format: GraphFormat, text: string, offset: number, message: string): never {
  const { line, column } = positionOf(text, offset)
  throw new FormatError(format, message, line, column)
}

export class LineCounter {
  readonly #text: string
  #offset = 0
  #line = 1

  constructor(text: string) {
    this.#text = text
  }

  at(offset: number): number {
    if (offset < this.#offset) {
      this.#offset = 0
      this.#line = 1
    }
    const text = this.#text
    let next = text.indexOf('\n', this.#offset)
    while (next !== -1 && next < offset) {
      this.#line += 1
      next = text.indexOf('\n', next + 1)
    }
    this.#offset = offset
    return this.#line
  }
}
