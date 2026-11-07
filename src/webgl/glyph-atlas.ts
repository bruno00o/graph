import TinySDF from '@mapbox/tiny-sdf'
import { warnLimit } from './caps'

export const atlasFontSize = 24
export const atlasWidth = 1024
const glyphBuffer = 3
const heightLimit = 4096
const ellipsis = '…'
const cacheLimit = 8192
const crowdedPasses = 8

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

export class RecentCache<V> {
  readonly #limit: number
  #fresh = new Map<string, V>()
  #old = new Map<string, V>()

  constructor(limit: number = cacheLimit) {
    this.#limit = Math.max(1, limit)
  }

  get size(): number {
    return this.#fresh.size + this.#old.size
  }

  get(key: string): V | undefined {
    const fresh = this.#fresh.get(key)
    if (fresh !== undefined) return fresh
    const old = this.#old.get(key)
    if (old !== undefined) {
      this.#old.delete(key)
      this.set(key, old)
    }
    return old
  }

  set(key: string, value: V): void {
    if (this.#fresh.size >= this.#limit) {
      this.#old = this.#fresh
      this.#fresh = new Map()
    }
    this.#fresh.set(key, value)
  }

  clear(): void {
    this.#fresh.clear()
    this.#old.clear()
  }
}

function blank(left: number, advance: number): Glyph {
  return { x: 0, y: 0, width: 0, height: 0, left, top: 0, advance }
}

interface FontFace {
  readonly renderer: TinySDF
  readonly lines: RecentCache<LineLayout>
  readonly fitted: RecentCache<string>
}

export class GlyphAtlas {
  pixels: Uint8Array = new Uint8Array(atlasWidth * 256)
  height = 256
  generation = 0
  dirtyFrom: number = Number.POSITIVE_INFINITY
  dirtyTo = -1
  readonly #glyphs = new Map<string, Glyph>()
  readonly #missing = new RecentCache<Glyph>()
  readonly #faces = new Map<string, FontFace>()
  #font: string
  readonly #maxHeight: number
  #penX = 0
  #penY = 0
  #rowHeight = 0
  #lastFace: FontFace | null = null
  #lastWeight = 0
  #lastFont: string | null = null
  #clears = 0
  #drops = 0
  #clearable = true
  #cleared = false
  #dropped = false
  #full = false
  #rest = 0

  constructor(font: string, maxHeight: number = heightLimit) {
    this.#font = font
    this.#maxHeight = Math.max(256, Math.min(heightLimit, maxHeight))
  }

  setFont(font: string): boolean {
    if (font === this.#font) return false
    this.#font = font
    this.#faces.clear()
    this.#missing.clear()
    this.#lastFace = null
    this.#reset()
    return true
  }

  settle(): void {
    if (this.#cleared && this.#dropped) this.#rest = crowdedPasses
    else if (this.#dropped && this.#rest > 0) this.#rest--
    this.#clearable = this.#rest === 0
    this.#cleared = false
    this.#dropped = false
  }

  line(text: string, weight: number, font: string | null = null): LineLayout {
    const face = this.#face(weight, font)
    const cached = face.lines.get(text)
    if (cached) return cached
    const clears = this.#clears
    const drops = this.#drops
    const glyphs: PlacedGlyph[] = []
    let pen = 0
    for (const char of text) {
      const glyph = this.#glyph(char, weight, font, face)
      if (glyph.width > 0 && char.trim() !== '') {
        glyphs.push({ glyph, x: pen + glyph.left - glyphBuffer })
      }
      pen += glyph.advance
    }
    if (this.#clears !== clears) return this.line(text, weight, font)
    const layout = { width: pen, glyphs: glyphs.map((g) => ({ glyph: g.glyph, x: g.x - pen / 2 })) }
    if (this.#drops === drops) face.lines.set(text, layout)
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
    const last = this.#lastFace
    if (last && weight === this.#lastWeight && font === this.#lastFont) return last
    const face = this.#findFace(weight, font)
    this.#lastFace = face
    this.#lastWeight = weight
    this.#lastFont = font
    return face
  }

  #findFace(weight: number, font: string | null): FontFace {
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
        lines: new RecentCache(),
        fitted: new RecentCache(),
      }
      this.#faces.set(key, face)
    }
    return face
  }

  #glyph(char: string, weight: number, font: string | null, face: FontFace): Glyph {
    const key = `${weight}\u0000${font ?? ''}\u0000${char}`
    const cached = this.#glyphs.get(key)
    if (cached) return cached
    if (this.#full) {
      const missing = this.#missing.get(key)
      if (missing && !this.#clearable) return this.#drop(missing)
    }
    const drawn = face.renderer.draw(char)
    if (this.#penX + drawn.width > atlasWidth) {
      this.#penX = 0
      this.#penY += this.#rowHeight + 1
      this.#rowHeight = 0
    }
    if (this.#penY + drawn.height > this.height) this.#grow(this.#penY + drawn.height)
    if (this.#penY + drawn.height > this.height) {
      this.#full = true
      if (!this.#clearable) {
        const empty = blank(drawn.glyphLeft, drawn.glyphAdvance)
        this.#missing.set(key, empty)
        return this.#drop(empty)
      }
      for (const [known, glyph] of this.#glyphs) {
        this.#missing.set(known, blank(glyph.left, glyph.advance))
      }
      this.#reset()
      this.#clearable = false
      this.#cleared = true
    }
    const glyph: Glyph = {
      x: this.#penX,
      y: this.#penY,
      width: drawn.width,
      height: drawn.height,
      left: drawn.glyphLeft,
      top: atlasFontSize - drawn.glyphTop - glyphBuffer,
      advance: drawn.glyphAdvance,
    }
    for (let row = 0; row < drawn.height; row++) {
      this.pixels.set(
        drawn.data.subarray(row * drawn.width, (row + 1) * drawn.width),
        (glyph.y + row) * atlasWidth + glyph.x,
      )
    }
    this.dirtyFrom = Math.min(this.dirtyFrom, glyph.y)
    this.dirtyTo = Math.max(this.dirtyTo, glyph.y + drawn.height - 1)
    this.#penX += drawn.width + 1
    this.#rowHeight = Math.max(this.#rowHeight, drawn.height)
    this.#glyphs.set(key, glyph)
    return glyph
  }

  #drop(glyph: Glyph): Glyph {
    this.#drops++
    this.#dropped = true
    warnLimit('glyphs', 'the glyph atlas is full, some characters of the labels are not drawn')
    return glyph
  }

  #reset(): void {
    this.#glyphs.clear()
    this.#full = false
    for (const face of this.#faces.values()) {
      face.lines.clear()
      face.fitted.clear()
    }
    this.#penX = 0
    this.#penY = 0
    this.#rowHeight = 0
    this.pixels.fill(0)
    this.#clears++
    this.generation++
  }

  #grow(required: number): void {
    let height = this.height
    while (height < required && height < this.#maxHeight) height *= 2
    if (height === this.height) return
    const pixels = new Uint8Array(atlasWidth * height)
    pixels.set(this.pixels)
    this.pixels = pixels
    this.height = height
    this.generation++
  }
}
