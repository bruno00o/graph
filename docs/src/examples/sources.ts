import { importsOf, isRelative, modulesOf } from './imports'
import type { Example } from './types'

const raw = import.meta.glob<string>(
  ['./*/*.ts', './*/*.tsx', './*/*.css', './*/*.json', '!./*/meta.ts', '!./*/*.test.ts'],
  { query: '?raw', import: 'default' },
)

export interface SourceFile {
  readonly path: string
  readonly name: string
  readonly code: string
  readonly language: string
}

export interface ExampleSources {
  readonly files: readonly SourceFile[]
  readonly modules: readonly string[]
}

function resolve(from: string, specifier: string): string | null {
  const parts = from.split('/').slice(0, -1)
  for (const part of specifier.split('?')[0]?.split('/') ?? []) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  const path = parts.join('/')
  return [path, `${path}.ts`, `${path}.tsx`].find((candidate) => candidate in raw) ?? null
}

export async function sourcesOf(example: Example): Promise<ExampleSources> {
  const folder = `./${example.slug}/`
  const entry = `${folder}${example.entry}`
  const paths = [
    entry,
    ...Object.keys(raw)
      .filter((path) => path.startsWith(folder) && path !== entry)
      .sort(),
  ]
  const files: SourceFile[] = []
  const imports: string[] = []
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index] ?? ''
    const read = raw[path]
    if (!read) continue
    const code = await read()
    const specifiers = importsOf(code)
    imports.push(...specifiers)
    for (const specifier of specifiers) {
      const target = isRelative(specifier) ? resolve(path, specifier) : null
      if (target && !paths.includes(target)) paths.push(target)
    }
    files.push({
      path: path.slice(2),
      name: path.startsWith(folder) ? path.slice(folder.length) : path.slice(2),
      code: code.replace(/\n$/, ''),
      language: path.split('.').at(-1) ?? 'ts',
    })
  }
  return { files, modules: modulesOf(imports) }
}
