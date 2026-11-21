import { css } from '@tanstack/highlight/languages/css'
import { json } from '@tanstack/highlight/languages/json'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import type { ReactNode } from 'react'
import { createCodeLines } from '../lib/code-lines'

const codeLines = createCodeLines([css, json, ts, tsx])

export function highlight(code: string, language = 'ts'): ReactNode[] {
  const nodes: ReactNode[] = []
  let offset = 0
  for (const tokens of codeLines(code, language)) {
    const start = offset
    const children: ReactNode[] = []
    for (const token of tokens) {
      children.push(
        token.kind ? (
          <span className={`tk-${token.kind}`} key={offset}>
            {token.value}
          </span>
        ) : (
          token.value
        ),
      )
      offset += token.value.length
    }
    if (nodes.length > 0) nodes.push('\n')
    nodes.push(
      <span className="line" key={start}>
        {children}
      </span>,
    )
    offset += 1
  }
  return nodes
}
