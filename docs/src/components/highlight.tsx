import type { ReactNode } from 'react'

type Kind = '' | 'k' | 'p' | 's' | 'n' | 'f'

const keywords = new Set(
  'import from export const let var function return if else new type interface await async typeof of for in true false null undefined extends as default satisfies readonly keyof void class while'.split(
    ' ',
  ),
)

const scriptLanguages = new Set(['ts', 'tsx', 'js', 'jsx', 'typescript', 'javascript', 'json'])

const pattern =
  /(\s+)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(\d[\d_]*(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\.\.\.|=>|\?\.|\?\?|[{}()[\];,.:<>/=?!&|+*-])/y

function kindOf(match: RegExpExecArray, rest: string, previous: string): Kind {
  const text = match[0]
  if (match[2]) return 's'
  if (match[3]) return 'n'
  if (match[5]) return 'p'
  if (keywords.has(text)) return 'k'
  if (/^\s*\(/.test(rest) || /^<[A-Z]\w*>\(/.test(rest)) return 'f'
  if ((previous === '<' || previous === '</') && /^[A-Z]/.test(text)) return 'f'
  return ''
}

interface Token {
  readonly kind: Kind
  text: string
  readonly start: number
}

function tokens(line: string): Token[] {
  const found: Token[] = []
  let previous = ''
  let at = 0
  while (at < line.length) {
    const start = at
    pattern.lastIndex = at
    const match = pattern.exec(line)
    if (!match) {
      found.push({ kind: '', text: line.charAt(at), start })
      at += 1
      continue
    }
    at = pattern.lastIndex
    const text = match[0]
    if (match[1]) {
      found.push({ kind: '', text, start })
      continue
    }
    found.push({ kind: kindOf(match, line.slice(at), previous), text, start })
    previous = text === '/' && previous === '<' ? '</' : text
  }
  const merged: Token[] = []
  for (const token of found) {
    const last = merged.at(-1)
    if (last && last.kind === token.kind) last.text += token.text
    else merged.push({ ...token })
  }
  return merged
}

interface Line {
  readonly text: string
  readonly start: number
}

function linesOf(code: string): Line[] {
  const lines: Line[] = []
  let start = 0
  for (const text of code.replace(/\n$/, '').split('\n')) {
    lines.push({ text, start })
    start += text.length + 1
  }
  return lines
}

function joinLines(lines: readonly ReactNode[]): ReactNode[] {
  return lines.flatMap((line, index) => (index === 0 ? [line] : ['\n', line]))
}

export function highlight(code: string, language = 'ts'): ReactNode[] {
  const lines = linesOf(code)
  if (!scriptLanguages.has(language)) {
    return joinLines(
      lines.map((line) => (
        <span className="line" key={line.start}>
          {line.text}
        </span>
      )),
    )
  }
  return joinLines(
    lines.map((line) => (
      <span className="line" key={line.start}>
        {tokens(line.text).map((token) =>
          token.kind ? (
            <span className={`tk-${token.kind}`} key={token.start}>
              {token.text}
            </span>
          ) : (
            token.text
          ),
        )}
      </span>
    )),
  )
}
