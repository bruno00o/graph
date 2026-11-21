export function siteOrigin(): string {
  return import.meta.env.DOCS_ORIGIN.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
