import { dev } from '../dev'

export const imageSize = 256
const levels = Math.log2(imageSize) + 1
const maxLayers = 256

interface Entry {
  count: number
  layer: number
}

export class ImageAtlas {
  readonly #gl: WebGL2RenderingContext
  readonly #invalidate: () => void
  readonly #entries = new Map<string, Entry>()
  readonly #free: number[] = []
  readonly #placeholder: WebGLTexture
  #texture: WebGLTexture | null = null
  #capacity = 0
  #next = 0
  #loaded = new Set<string>()
  readonly #loading = new Set<Promise<void>>()
  #mipsStale = false
  #canvas: HTMLCanvasElement | null = null
  #warnedFull = false
  #destroyed = false

  constructor(gl: WebGL2RenderingContext, invalidate: () => void) {
    this.#gl = gl
    this.#invalidate = invalidate
    this.#placeholder = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#placeholder)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 1)
  }

  get texture(): WebGLTexture {
    return this.#texture ?? this.#placeholder
  }

  get bytes(): number {
    let texels = 0
    for (let level = 0; level < levels; level++) texels += (imageSize >> level) ** 2
    return this.#capacity * texels * 4
  }

  layer(src: string): number {
    return this.#entries.get(src)?.layer ?? -1
  }

  acquire(src: string): void {
    const entry = this.#entries.get(src)
    if (entry) {
      entry.count++
      return
    }
    this.#entries.set(src, { count: 1, layer: -1 })
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.src = src
    const loading = image.decode().then(
      () => this.#store(src, image),
      () => this.#fail(src),
    )
    this.#loading.add(loading)
    void loading.finally(() => this.#loading.delete(loading))
  }

  async settled(): Promise<void> {
    while (this.#loading.size > 0) await Promise.all(this.#loading)
  }

  release(src: string): void {
    const entry = this.#entries.get(src)
    if (!entry || --entry.count > 0) return
    this.#entries.delete(src)
    if (entry.layer >= 0) this.#free.push(entry.layer)
  }

  takeLoaded(): ReadonlySet<string> | null {
    if (this.#loaded.size === 0) return null
    const loaded = this.#loaded
    this.#loaded = new Set()
    return loaded
  }

  prepare(): void {
    if (!this.#mipsStale || !this.#texture) return
    this.#mipsStale = false
    const gl = this.#gl
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture)
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
  }

  destroy(): void {
    this.#destroyed = true
    this.#gl.deleteTexture(this.#placeholder)
    if (this.#texture) this.#gl.deleteTexture(this.#texture)
  }

  #fail(src: string): void {
    if (this.#destroyed) return
    if (dev && this.#entries.has(src)) console.warn(`graph: cannot load the image ${src}`)
  }

  #store(src: string, image: HTMLImageElement): void {
    const entry = this.#entries.get(src)
    if (this.#destroyed || !entry || entry.layer >= 0) return
    const layer = this.#free.pop() ?? this.#next
    if (layer >= this.#capacity && !this.#grow()) {
      if (dev && !this.#warnedFull) {
        this.#warnedFull = true
        console.warn(`graph: more than ${maxLayers} distinct images, the others are not drawn`)
      }
      return
    }
    if (layer === this.#next) this.#next++
    const canvas = this.#draw(image)
    const gl = this.#gl
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    try {
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        layer,
        imageSize,
        imageSize,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        canvas,
      )
    } catch {
      this.#free.push(layer)
      this.#fail(src)
      return
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    }
    entry.layer = layer
    this.#mipsStale = true
    this.#loaded.add(src)
    this.#invalidate()
  }

  #draw(image: HTMLImageElement): HTMLCanvasElement {
    this.#canvas ??= Object.assign(document.createElement('canvas'), {
      width: imageSize,
      height: imageSize,
    })
    const context = this.#canvas.getContext('2d')
    if (context) {
      context.clearRect(0, 0, imageSize, imageSize)
      const width = image.naturalWidth
      const height = image.naturalHeight
      const scale = width > 0 && height > 0 ? imageSize / Math.min(width, height) : 0
      const drawnWidth = scale > 0 ? width * scale : imageSize
      const drawnHeight = scale > 0 ? height * scale : imageSize
      context.drawImage(
        image,
        (imageSize - drawnWidth) / 2,
        (imageSize - drawnHeight) / 2,
        drawnWidth,
        drawnHeight,
      )
    }
    return this.#canvas
  }

  #grow(): boolean {
    if (this.#capacity >= maxLayers) return false
    const gl = this.#gl
    const capacity = Math.min(maxLayers, Math.max(4, this.#capacity * 2))
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture)
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, imageSize, imageSize, capacity)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const previous = this.#texture
    if (previous) {
      const framebuffer = gl.createFramebuffer()
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer)
      for (let layer = 0; layer < this.#capacity; layer++) {
        gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, previous, 0, layer)
        gl.copyTexSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, 0, 0, imageSize, imageSize)
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      gl.deleteFramebuffer(framebuffer)
      gl.deleteTexture(previous)
    }
    this.#texture = texture
    this.#capacity = capacity
    this.#mipsStale = true
    return true
  }
}
