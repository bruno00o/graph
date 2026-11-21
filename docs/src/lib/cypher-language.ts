import { defineLanguage, type TokenRange } from '@tanstack/highlight/core'

const rules: readonly (readonly [RegExp, TokenRange['className']])[] = [
  [/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, 'comment'],
  [/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, 'string'],
  [/\b\d+(?:\.\d+)?\b/g, 'number'],
  [/\b(?:true|false|null)\b/gi, 'literal'],
  [
    /\b(?:AND|AS|ASC|ASCENDING|BY|CALL|CASE|CREATE|DELETE|DESC|DESCENDING|DETACH|DISTINCT|ELSE|END|EXISTS|IN|IS|LIMIT|MATCH|MERGE|NOT|OPTIONAL|OR|ORDER|REMOVE|RETURN|SET|SKIP|THEN|UNION|UNWIND|WHEN|WHERE|WITH|XOR)\b/gi,
    'keyword',
  ],
  [/\b[A-Za-z_]\w*(?=\()/g, 'function'],
]

export const cypher = defineLanguage({
  name: 'cypher',
  tokenize(code) {
    const ranges: TokenRange[] = []
    for (const [pattern, className] of rules) {
      for (const match of code.matchAll(pattern)) {
        const start = match.index
        const end = start + match[0].length
        if (!ranges.some((range) => start < range.end && end > range.start)) {
          ranges.push({ start, end, className })
        }
      }
    }
    return ranges.sort((a, b) => a.start - b.start)
  },
})
