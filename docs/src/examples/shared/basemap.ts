import type { Map as MapLibreMap } from 'maplibre-gl'

export type Scheme = 'light' | 'dark'

export const openFreeMapStyles = ['positron', 'liberty', 'bright', 'dark', 'fiord'] as const

export type OpenFreeMapStyle = (typeof openFreeMapStyles)[number]

export function openFreeMapUrl(name: OpenFreeMapStyle): string {
  return `https://tiles.openfreemap.org/styles/${name}`
}

export function siteScheme(): Scheme {
  const { classList } = document.documentElement
  if (classList.contains('dark')) return 'dark'
  if (classList.contains('light')) return 'light'
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function watchScheme(listener: (scheme: Scheme) => void): () => void {
  const update = () => listener(siteScheme())
  const observer = new MutationObserver(update)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  const query = matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', update)
  return () => {
    observer.disconnect()
    query.removeEventListener('change', update)
  }
}

export function siteBasemap(scheme: Scheme = siteScheme()): string {
  return openFreeMapUrl(scheme === 'dark' ? 'dark' : 'positron')
}

export function followSiteBasemap(map: MapLibreMap): () => void {
  let shown = siteBasemap()
  return watchScheme((scheme) => {
    const next = siteBasemap(scheme)
    if (next === shown) return
    shown = next
    map.setStyle(next)
  })
}
