export function siteOrigin(): string {
  return import.meta.env.DOCS_ORIGIN.replace(/\/+$/, '')
}

function isFile(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path.slice(path.lastIndexOf('/') + 1))
}

export function absoluteUrl(path: string): string {
  const trimmed = path.replace(/^\/+/, '')
  const page = trimmed === '' || trimmed.endsWith('/') || isFile(trimmed) ? trimmed : `${trimmed}/`
  return `${siteOrigin()}${import.meta.env.BASE_URL}${page}`
}
