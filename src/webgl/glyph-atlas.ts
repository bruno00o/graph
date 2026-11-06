import TinySDF from '@mapbox/tiny-sdf'

export const atlasFontSize = 24
export const atlasWidth = 1024
const glyphBuffer = 3
const maxHeight = 4096
const ellipsis = '…'

export interface Glyph {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly left: number
  readonly top: number
  readonly advance: number
}

export interface PlacedGlyph {
  readonly glyph: Glyph
  readonly x: number
}

export interface LineLayout {
  readonly width: number
  readonly glyphs: readonly PlacedGlyph[]
}

interface FontFace {
  readonly renderer: TinySDF
  readonly lines: Map<string, LineLayout>
  readonly fitted: Map<string, string>
}

export class GlyphAtlas {
  pixels: Uint8Array = new Uint8Array(atlasWidth * 256)
  height = 256
  generation = 0
  dirtyFrom: number = Number.POSITIVE_INFINITY
  dirtyTo = -1
  readonly #glyphs = new Map<string, Glyph>()
  readonly #faces = new Map<string, FontFace>()
  #font: string
  #penX = 0
  #penY = 0
  #rowHeight = 0

  constructor(font: string) {
    this.#font = font
  }

  setFont(font: string): boolean {
    if (font === this.#font) return false
    this.#font = font
    this.#glyphs.clear()
    this.#faces.clear()
    this.#penX = 0
    this.#penY = 0
    this.#rowHeight = 0
    this.pixels.fill(0)
    this.generation++
    return true
  }

  line(text: string, weight: number, font: string | null = null): LineLayout {
    const face = this.#face(weight, font)
    const cached = face.lines.get(text)
    if (cached) return cached
    const glyphs: PlacedGlyph[] = []
    let pen = 0
    for (const char of text) {
      const glyph = this.#glyph(char, weight, font, face)
      if (glyph.width > 0 && char.trim() !== '') {
        glyphs.push({ glyph, x: pen + glyph.left - glyphBuffer })
      }
      pen += glyph.advance
    }
    const layout = { width: pen, glyphs: glyphs.map((g) => ({ glyph: g.glyph, x: g.x - pen / 2 })) }
    face.lines.set(text, layout)
    return layout
  }

  fit(text: string, weight: number, font: string | null, width: number): string {
    const face = this.#face(weight, font)
    const key = `${width}\u0000${text}`
    const cached = face.fitted.get(key)
    if (cached !== undefined) return cached
    let result = text
    if (this.line(text, weight, font).width > width) {
      const room = width - this.#glyph(ellipsis, weight, font, face).advance
      let pen = 0
      let end = 0
      const chars = Array.from(text)
      for (const char of chars) {
        const advance = this.#glyph(char, weight, font, face).advance
        if (pen + advance > room) break
        pen += advance
        end++
      }
      result = `${chars.slice(0, end).join('').trimEnd()}${ellipsis}`
    }
    face.fitted.set(key, result)
    return result
  }

  takeDirty(): readonly [number, number] | null {
    if (this.dirtyTo < this.dirtyFrom) return null
    const range = [this.dirtyFrom, this.dirtyTo] as const
    this.dirtyFrom = Number.POSITIVE_INFINITY
    this.dirtyTo = -1
    return range
  }

  #face(weight: number, font: string | null): FontFace {
    const key = `${weight}\u0000${font ?? ''}`
    let face = this.#faces.get(key)
    if (!face) {
      face = {
        renderer: new TinySDF({
          fontSize: atlasFontSize,
          buffer: glyphBuffer,
          radius: 8,
          cutoff: 0.25,
          fontFamily: font ?? this.#font,
          fontWeight: String(weight),
        }),
        lines: new Map(),
        fitted: new Map(),
      }
      this.#faces.set(key, face)
    }
    return face
  }

  #glyph(char: string, weight: number, font: string | null, face: FontFace): Glyph {
    const key = `${weight}\u0000${font ?? ''}\u0000${char}`
    const cached = this.#glyphs.get(key)
    if (cached) return cached
    const drawn = face.renderer.draw(char)
    if (this.#penX + drawn.width > atlasWidth) {
      this.#penX = 0
      this.#penY += this.#rowHeight + 1
      this.#rowHeight = 0
    }
    if (this.#penY + drawn.height > this.height) this.#grow(this.#penY + drawn.height)
    const glyph: Glyph = {
      x: this.#penX,
      y: this.#penY,
      width: drawn.width,
      height: drawn.height,
      left: drawn.glyphLeft,
      top: atlasFontSize - drawn.glyphTop - glyphBuffer,
      advance: drawn.glyphAdvance,
    }
    if (this.#penY + drawn.height <= this.height) {
      for (let row = 0; row < drawn.height; row++) {
        this.pixels.set(
          drawn.data.subarray(row * drawn.width, (row + 1) * drawn.width),
          (glyph.y + row) * atlasWidth + glyph.x,
        )
      }
      this.dirtyFrom = Math.min(this.dirtyFrom, glyph.y)
      this.dirtyTo = Math.max(this.dirtyTo, glyph.y + drawn.height - 1)
    }
    this.#penX += drawn.width + 1
    this.#rowHeight = Math.max(this.#rowHeight, drawn.height)
    this.#glyphs.set(key, glyph)
    return glyph
  }

  #grow(required: number): void {
    let height = this.height
    while (height < required && height < maxHeight) height *= 2
    if (height === this.height) return
    const pixels = new Uint8Array(atlasWidth * height)
    pixels.set(this.pixels)
    this.pixels = pixels
    this.height = height
    this.generation++
  }
}
