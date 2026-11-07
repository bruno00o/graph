import { resolve } from 'node:path'
import { defineConfig } from 'fumadocs-mdx/config'
import {
  createGenerator,
  type DocEntry,
  type Generator,
  type RemarkAutoTypeTableOptions,
  remarkAutoTypeTable,
} from 'fumadocs-typescript'

const library = resolve(import.meta.dirname, '../src')

function readableType(type: string): string {
  return type.replace(/"([^"\\]*)"/g, "'$1'").replaceAll('<ArrayBufferLike>', '')
}

function unionMembers(type: string): string[] {
  const members: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let at = 0; at < type.length; at++) {
    const char = type.charAt(at)
    if (quote) {
      if (char === quote && type.charAt(at - 1) !== '\\') quote = ''
    } else if (char === "'" || char === '"' || char === '`') quote = char
    else if ('(<[{'.includes(char)) depth++
    else if (')]}'.includes(char) || (char === '>' && type.charAt(at - 1) !== '=')) depth--
    else if (char === '|' && depth === 0) {
      members.push(type.slice(start, at).trim())
      start = at + 1
    }
  }
  members.push(type.slice(start).trim())
  return members.filter((member) => member !== '')
}

function wrapped(type: string): boolean {
  if (!type.startsWith('(') || !type.endsWith(')')) return false
  let depth = 0
  for (let at = 0; at < type.length - 1; at++) {
    if (type.charAt(at) === '(') depth++
    else if (type.charAt(at) === ')') depth--
    if (depth === 0) return false
  }
  return true
}

function withoutUndefined(type: string): string {
  const inner = type.replace(/\?: ([^;{}]*?) \| undefined;/g, '?: $1;')
  const members = unionMembers(inner)
  const kept = members.filter((member) => member !== 'undefined')
  if (kept.length === members.length || kept.length === 0) return inner
  const [only] = kept
  return kept.length === 1 && only && wrapped(only) ? only.slice(1, -1) : kept.join(' | ')
}

const typeScript = createGenerator({ tsconfigPath: resolve(library, '../tsconfig.json') })

const generator: Generator = {
  ...typeScript,
  async generateDocumentation(file, name, options) {
    const docs = await typeScript.generateDocumentation(file, name, options)
    return docs.map((doc) => ({
      ...doc,
      entries: doc.entries.filter((entry) => entry.type !== 'undefined'),
    }))
  },
}

const apiTables: RemarkAutoTypeTableOptions = {
  name: 'api-table',
  outputName: 'ApiTable',
  generator,
  renderType: (value) => ({
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value }],
  }),
  options: {
    basePath: library,
    transform(entry: DocEntry) {
      const type = readableType(entry.type)
      entry.type = entry.required ? type : withoutUndefined(type)
      entry.simplifiedType = entry.type
    },
  },
}

function inkTheme(name: string, type: 'light' | 'dark') {
  return {
    name,
    type,
    colors: {
      'editor.foreground': 'var(--code-ink)',
      'editor.background': 'var(--code-paper)',
    },
    tokenColors: [
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: 'var(--code-muted)', fontStyle: 'italic' },
      },
      {
        scope: [
          'keyword',
          'storage',
          'storage.type',
          'storage.modifier',
          'punctuation',
          'meta.brace',
          'meta.tag',
          'entity.name.tag',
          'support.type.property-name.json',
          'variable.language',
        ],
        settings: { foreground: 'var(--code-muted)' },
      },
      {
        scope: [
          'string',
          'string.template',
          'constant.numeric',
          'constant.language.boolean',
          'constant.character',
          'markup.inline.raw',
        ],
        settings: { foreground: 'var(--code-literal)' },
      },
      {
        scope: [
          'entity.name.function',
          'support.function',
          'meta.function-call entity.name.function',
          'entity.name.type',
          'support.type.primitive',
        ],
        settings: { foreground: 'var(--code-ink)', fontStyle: 'bold' },
      },
    ],
  }
}

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [[remarkAutoTypeTable, apiTables]],
    rehypeCodeOptions: {
      themes: {
        light: inkTheme('graph-ink-light', 'light'),
        dark: inkTheme('graph-ink-dark', 'dark'),
      },
    },
  },
})
