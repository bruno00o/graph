import { absoluteUrl } from './origin'

export interface PreviewImage {
  readonly url: string
  readonly width: number
  readonly height: number
}

export const thumbnailSize = { width: 640, height: 400 } as const
export const drawnSize = { width: 1200, height: 630 } as const

export function trimmed(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

export function ogPath(path: string): string {
  const page = trimmed(path)
  return `og/${page === '' ? 'index' : page}.png`
}

export function ogImage(path: string): string {
  return absoluteUrl(ogPath(path))
}

export function previewImage(path: string, thumbnail: boolean): PreviewImage {
  return { url: ogImage(path), ...(thumbnail ? thumbnailSize : drawnSize) }
}
