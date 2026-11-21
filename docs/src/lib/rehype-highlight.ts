import { css } from '@tanstack/highlight/languages/css'
import { html } from '@tanstack/highlight/languages/html'
import { json } from '@tanstack/highlight/languages/json'
import { shell } from '@tanstack/highlight/languages/shell'
import { ts } from '@tanstack/highlight/languages/ts'
import { tsx } from '@tanstack/highlight/languages/tsx'
import type { Highlighter } from 'fumadocs-core/highlight'
import { rehypeCodeFromHighlighter } from 'fumadocs-core/mdx-plugins/rehype-code.core'
import { transformerIcon } from 'fumadocs-core/mdx-plugins/transformer-icon'
import { type CodeToken, createCodeLines } from './code-lines'
import { cypher } from './cypher-language'

const icons = transformerIcon()
const codeLines = createCodeLines([css, html, json, shell, ts, tsx, cypher])

type Root = ReturnType<Highlighter['codeToHast']>
type Node = Extract<Root['children'][number], { type: 'element' | 'text' | 'comment' }>

function textNode(value: string): Node {
  return { type: 'text', value }
}

function tokenNode(token: CodeToken): Node {
  if (!token.kind) return textNode(token.value)
  return {
    type: 'element',
    tagName: 'span',
    properties: { className: [`tk-${token.kind}`] },
    children: [textNode(token.value)],
  }
}

function lineNodes(lines: readonly (readonly CodeToken[])[]): Node[] {
  return lines.flatMap((tokens, index): Node[] => {
    const line: Node = {
      type: 'element',
      tagName: 'span',
      properties: { className: ['line'] },
      children: tokens.map(tokenNode),
    }
    return index === 0 ? [line] : [textNode('\n'), line]
  })
}

const highlighter: Highlighter = {
  codeToHast(code, { lang, meta = {} }) {
    const properties: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(meta)) {
      if (!key.startsWith('__') && value !== undefined) {
        properties[key] = value as string | number | boolean
      }
    }
    const { title } = properties
    if (title) icons.pre?.call({ options: { lang } } as never, { properties } as never)
    return {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties,
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: lineNodes(codeLines(code, lang)),
            },
          ],
        },
      ],
    }
  },
}

export const rehypeHighlight = () => rehypeCodeFromHighlighter(highlighter)
