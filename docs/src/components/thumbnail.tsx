import type { JSX } from 'react'
import {
  type Thumbnail,
  type ThumbnailImage,
  thumbnailHeight,
  thumbnailSizes,
  thumbnailWidth,
} from '../lib/thumbnail'

function Picture({
  image,
  className,
  alt,
  eager,
  priority,
}: {
  readonly image: ThumbnailImage
  readonly className: string
  readonly alt: string
  readonly eager: boolean
  readonly priority: 'high' | 'auto'
}): JSX.Element {
  return (
    <img
      className={className}
      src={image.src}
      srcSet={image.srcSet === '' ? undefined : image.srcSet}
      sizes={image.srcSet === '' ? undefined : thumbnailSizes}
      alt={alt}
      width={thumbnailWidth}
      height={thumbnailHeight}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority}
    />
  )
}

export function ThumbnailPair({
  images,
  alt,
  eager = false,
}: {
  readonly images: Thumbnail
  readonly alt: string
  readonly eager?: boolean
}): JSX.Element {
  return (
    <>
      <Picture
        image={images.light}
        className="thumb-light"
        alt={alt}
        eager={eager}
        priority={eager ? 'high' : 'auto'}
      />
      <Picture image={images.dark} className="thumb-dark" alt={alt} eager={false} priority="auto" />
    </>
  )
}
