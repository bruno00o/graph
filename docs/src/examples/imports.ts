import type { ExampleKind, ExampleTag } from './types'

const staticImport = /(?:^|\n)\s*(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g
const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

const integrations: readonly (readonly [ExampleTag, readonly string[]])[] = [
  ['TanStack DB', ['@tanstack/db', '@bruno00o/graph/db']],
  ['TanStack Query', ['@tanstack/query-core', '@tanstack/react-query', '@bruno00o/graph/query']],
  [
    'TanStack Devtools',
    [
      '@tanstack/devtools',
      '@tanstack/react-devtools',
      '@bruno00o/graph/devtools',
      '@bruno00o/graph/devtools/react',
    ],
  ],
]

export function importsOf(code: string): string[] {
  const found = [...code.matchAll(staticImport), ...code.matchAll(dynamicImport)]
  return [...new Set(found.map((match) => match[1] ?? ''))]
}

export function isRelative(specifier: string): boolean {
  return specifier.startsWith('.')
}

export function moduleOf(specifier: string): string {
  const path = specifier.split('?')[0] ?? specifier
  if (path.startsWith('@bruno00o/graph')) return path
  const parts = path.split('/')
  return path.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? path)
}

export function modulesOf(specifiers: readonly string[]): string[] {
  return [
    ...new Set(
      specifiers.filter((specifier) => !isRelative(specifier)).map((item) => moduleOf(item)),
    ),
  ]
}

export function tagsOf(kind: ExampleKind, specifiers: readonly string[]): ExampleTag[] {
  const modules = new Set(modulesOf(specifiers))
  const tags: ExampleTag[] = [kind === 'react' ? 'React' : 'Vanilla']
  for (const [tag, names] of integrations) {
    if (names.some((name) => modules.has(name))) tags.push(tag)
  }
  return tags
}
