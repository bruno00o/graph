import { describe, expect, it } from 'vitest'
import { thumbnailImage, thumbnailWidth } from './thumbnail'

describe('thumbnailImage', () => {
  it('lists the resized files and the original with its own width', () => {
    const image = thumbnailImage('/full.webp', '/small.webp 320w, /medium.webp 480w')
    expect(image).toEqual({
      src: '/full.webp',
      srcSet: `/small.webp 320w, /medium.webp 480w, /full.webp ${thumbnailWidth}w`,
    })
  })

  it('serves the original alone when nothing was resized', () => {
    expect(thumbnailImage('/full.webp', undefined)).toEqual({ src: '/full.webp', srcSet: '' })
  })

  it('has no image without a source', () => {
    expect(thumbnailImage(undefined, '/small.webp 320w')).toBeNull()
  })
})
