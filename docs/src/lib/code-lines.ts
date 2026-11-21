import { createHighlighter, type LanguageDefinition } from '@tanstack/highlight/core'

export type CodeKind = 'k' | 's' | 'c' | 'f'

export interface CodeToken {
  readonly kind?: CodeKind
  readonly value: string
}

const kinds: Readonly<Record<string, CodeKind>> = {
  keyword: 'k',
  tag: 'k',
  string: 's',
  number: 's',
  literal: 's',
  comment: 'c',
  function: 'f',
}

const kindsByLanguage: Readonly<Record<string, Readonly<Record<string, CodeKind>>>> = {
  json: { property: 'k' },
  css: { selector: 'k' },
}

export function createCodeLines(
  languages: readonly LanguageDefinition[],
): (code: string, language: string, functions: boolean) => CodeToken[][] {
  const highlighter = createHighlighter({ languages })
  return (code, language, functions) => {
    const own = kindsByLanguage[highlighter.normalizeLanguage(language)]
    const lines: CodeToken[][] = [[]]
    for (const token of highlighter.tokenize(code.replace(/\n$/, ''), { lang: language }).tokens) {
      const name = token.className ?? ''
      const kind = own?.[name] ?? kinds[name]
      const shown = kind === 'f' && !functions ? undefined : kind
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
