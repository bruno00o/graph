import library from '../../package.json'

export const version: string = library.version
export const repository = 'https://github.com/bruno00o/graph'
export const npmPackage = 'https://www.npmjs.com/package/@bruno00o/graph'
export const changelog = `${repository}/blob/main/CHANGELOG.md`

export function sourceUrl(path: string): string {
  return `${repository}/blob/main/${path}`
}

export function editUrl(path: string): string {
  return `${repository}/edit/main/${path}`
}

export const benchmark = { nodes: 50_000, edges: 100_000 } as const
