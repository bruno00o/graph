import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTextWidths } from './text-width'

const fonts: string[] = []

class FakeCanvas {
  getContext() {
    const context = {
      font: '',
      measureText: (text: string) => {
        fonts.push(context.font)
        const wide = context.font.includes(' 700 ') ? 18 : 12
        return { width: text === 'm' ? wide * 2 : wide }
      },
    }
    return context
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  fonts.length = 0
})

describe('createTextWidths', () => {
  it('measures each character in the face of the glyph atlas, in ems', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    const widths = createTextWidths('Sans')
    expect(widths.width('am', 500, null)).toBeCloseTo(36 / 24, 9)
    expect(widths.width('a', 700, null)).toBeCloseTo(18 / 24, 9)
    expect(widths.width('a', 500, 'Serif')).toBeCloseTo(0.5, 9)
    expect(fonts).toContain('normal 500 24px Sans')
    expect(fonts).toContain('normal 700 24px Sans')
    expect(fonts).toContain('normal 500 24px Serif')
  })

  it('keeps the advance of a character and follows the font of the theme', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    const widths = createTextWidths('Sans')
    widths.width('aaaa', 500, null)
    expect(fonts).toHaveLength(1)
    expect(widths.setFont('Sans')).toBe(false)
    expect(widths.setFont('Mono')).toBe(true)
    widths.width('a', 500, null)
    expect(fonts.at(-1)).toBe('normal 500 24px Mono')
  })

  it('measures again only the faces of the families that loaded', () => {
    vi.stubGlobal('OffscreenCanvas', FakeCanvas)
    const widths = createTextWidths('Sans, sans-serif')
    widths.width('a', 500, null)
    widths.width('a', 500, 'Serif')
    expect(fonts).toHaveLength(2)
    expect(widths.reload(new Set(['mono']))).toBe(false)
    widths.width('a', 500, null)
    expect(fonts).toHaveLength(2)
    expect(widths.reload(new Set(['sans']))).toBe(true)
    widths.width('a', 500, 'Serif')
    expect(fonts).toHaveLength(2)
    widths.width('a', 500, null)
    expect(fonts).toHaveLength(3)
    expect(widths.reload(null)).toBe(true)
    widths.width('a', 500, 'Serif')
    expect(fonts).toHaveLength(4)
  })

  it('estimates widths without a canvas', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    vi.stubGlobal('document', undefined)
    const widths = createTextWidths('Sans')
    expect(widths.width('abc', 500, null)).toBeCloseTo(1.8, 9)
  })
})
