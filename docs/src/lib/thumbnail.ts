export const thumbnailWidth = 640
export const thumbnailHeight = 400
export const thumbnailSizes = '(max-width: 640px) calc(100vw - 42px), 320px'

export interface ThumbnailImage {
  readonly src: string
  readonly srcSet: string
}

export interface Thumbnail {
  readonly light: ThumbnailImage
  readonly dark: ThumbnailImage
}

export type ThumbnailFiles = Readonly<Record<string, string>>

export function thumbnailImage(
  src: string | undefined,
  resized: string | undefined,
): ThumbnailImage | null {
  if (!src) return null
  return { src, srcSet: resized ? `${resized}, ${src} ${thumbnailWidth}w` : '' }
}
