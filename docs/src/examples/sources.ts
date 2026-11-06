const raw = import.meta.glob<string>(['./*/*.ts', './*/*.tsx', './*/*.css'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

export interface SourceFile {
  readonly path: string
  readonly name: string
  readonly code: string
  readonly language: string
}

export function sourcesOf(paths: readonly string[]): SourceFile[] {
  return paths.flatMap((path) => {
    const code = raw[`./${path}`]
    if (code === undefined) return []
    const name = path.startsWith('shared/') ? path.slice('shared/'.length) : path.split('/')[1]
    return [
      {
        path,
        name: name ?? path,
        code: code.replace(/\n$/, ''),
        language: path.split('.').at(-1) ?? 'ts',
      },
    ]
  })
}
