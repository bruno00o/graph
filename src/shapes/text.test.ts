import { describe, expect, it } from 'vitest'
import { geoToWorld } from '../core/geo'
import { metersToWorld, wrapText } from './text'

const measure = (text: string) => text.length

describe('wrapText', () => {
  it('fills each line with as many words as fit', () => {
    expect(wrapText('one two three four', 9, measure)).toBe('one two\nthree\nfour')
    expect(wrapText('one two three four', 18, measure)).toBe('one two three four')
  })

  it('keeps the line breaks of the text and drops the repeated spaces', () => {
    expect(wrapText('a  b\n\nc', 10, measure)).toBe('a b\n\nc')
  })

  it('breaks a word wider than the line between its characters', () => {
    expect(wrapText('ab abcdefg', 3, measure)).toBe('ab\nabc\ndef\ng')
  })

  it('leaves the text as it is without a width', () => {
    expect(wrapText('one two', 0, measure)).toBe('one two')
  })
})

describe('metersToWorld', () => {
  it('turns meters into world units at the latitude of a point', () => {
    const equator = geoToWorld({ longitude: 0, latitude: 0 })
    const north = geoToWorld({ longitude: 0, latitude: 60 })
    const perMeter = 512 / (2 * Math.PI * 6_371_008.8)
    expect(metersToWorld(1000, equator.y) / (1000 * perMeter)).toBeCloseTo(1, 9)
    expect(metersToWorld(1000, north.y) / (2000 * perMeter)).toBeCloseTo(1, 9)
  })
})
