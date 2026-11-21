import { createHighlighter, type LanguageDefinition } from '@tanstack/highlight/core'

export type CodeKind = 'k' | 's' | 'n' | 't' | 'f' | 'a' | 'c'

export interface CodeToken {
  readonly kind?: CodeKind
  readonly value: string
}

const kinds: Readonly<Record<string, CodeKind>> = {
  keyword: 'k',
  string: 's',
  number: 'n',
  literal: 'n',
  type: 't',
  tag: 't',
  function: 'f',
  command: 'f',
  attr: 'a',
  variable: 'a',
  comment: 'c',
}

const kindsByLanguage: Readonly<Record<string, Readonly<Record<string, CodeKind>>>> = {
  json: { property: 't' },
  css: { selector: 't', property: 'a' },
}

export function createCodeLines(
  languages: readonly LanguageDefinition[],
): (code: string, language: string) => CodeToken[][] {
  const highlighter = createHighlighter({ languages })
  return (code, language) => {
    const own = kindsByLanguage[highlighter.normalizeLanguage(language)]
    const lines: CodeToken[][] = [[]]
    for (const token of highlighter.tokenize(code.replace(/\n$/, ''), { lang: language }).tokens) {
      const name = token.className ?? ''
      const shown = own?.[name] ?? kinds[name]
      token.value.split('\n').forEach((value, index) => {
        if (index > 0) lines.push([])
        if (value === '') return
        const line = lines.at(-1)
        const last = line?.at(-1)
        if (line && last && last.kind === shown) {
          line[line.length - 1] = { ...last, value: last.value + value }
        } else line?.push(shown ? { kind: shown, value } : { value })
      })
    }
    return lines
  }
}
