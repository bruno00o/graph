import { resolve } from 'node:path'
import { defineConfig } from 'fumadocs-mdx/config'
import {
  createGenerator,
  type DocEntry,
  type RemarkAutoTypeTableOptions,
  remarkAutoTypeTable,
} from 'fumadocs-typescript'

const library = resolve(import.meta.dirname, '../src')

function readableType(type: string): string {
  return type.replace(/"([^"\\]*)"/g, "'$1'").replaceAll('<ArrayBufferLike>', '')
}

const apiTables: RemarkAutoTypeTableOptions = {
  name: 'api-table',
  outputName: 'ApiTable',
  generator: createGenerator({ tsconfigPath: resolve(library, '../tsconfig.json') }),
  renderType: (value) => ({
    type: 'element',
    tagName: 'code',
    properties: {},
    children: [{ type: 'text', value }],
  }),
  options: {
    basePath: library,
    transform(entry: DocEntry) {
      entry.type = readableType(entry.type)
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
