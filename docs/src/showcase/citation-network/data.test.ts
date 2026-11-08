import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sameOptions } from '../../../../src/core/same-options'
import { prepare, type RawDataset, searchWorks, topWorks, yearTime } from './data'
import { definitionOf } from './definition'
import { messages } from './messages'

const folder = fileURLToPath(new URL('.', import.meta.url))
const published = join(folder, '../../../public/showcase-data/citation-network')

const sample: RawDataset = {
  retrieved: '2026-11-08T12:42:41Z',
  topic: { id: 'T11476', name: 'Graph theory' },
  works: {
    id: ['W1', 'W2', 'W3', 'W4', 'W5'],
    title: ['Alpha', 'Beta graphs', 'Gamma', 'Delta', 'Epsilon'],
    year: [1975, 1980, 1990, null, 2001],
    citations: [10, 20, 0, 5, 1],
    author: ['A. One', 'B. Two', null, 'D. Four', null],
  },
  cites: [0, 1, 1, 0, 2, 0, 3, 2, 4, 4, 99, 0],
}

describe('columns', () => {
  const network = prepare(sample)

  it('reads the works of every column, gaps included', () => {
    expect(network.works.map((work) => work.id)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5'])
    expect(network.works[2]?.author).toBeNull()
    expect(network.works[3]?.year).toBeNull()
    expect(network.works[0]?.title).toBe('Alpha')
    expect(network.works[0]?.citations).toBe(10)
    expect(network.works[4]?.author).toBeNull()
  })

  it('turns the flat pairs into links from the citing work to the cited one', () => {
    expect(network.links.map((link) => [link.from, link.to])).toEqual([
      ['W1', 'W2'],
      ['W2', 'W1'],
      ['W3', 'W1'],
      ['W4', 'W3'],
    ])
    expect(network.links.every((link, index) => link.id === `l${index}`)).toBe(true)
  })

  it('skips out-of-range pairs and self citations', () => {
    expect(network.links).toHaveLength(4)
    expect(network.works[4]?.incoming).toBe(0)
    expect(network.works[4]?.outgoing).toBe(0)
  })

  it('counts the incoming and outgoing citations of each work', () => {
    expect(network.works.map((work) => work.incoming)).toEqual([2, 1, 1, 0, 0])
    expect(network.works.map((work) => work.outgoing)).toEqual([1, 1, 1, 1, 0])
    expect(network.maxIncoming).toBe(2)
  })

  it('indexes the neighbors of a work on both sides', () => {
    expect(network.citingOf.get('W1')?.map((work) => work.id)).toEqual(['W2'])
    expect(network.citedByOf.get('W1')?.map((work) => work.id)).toEqual(['W2', 'W3'])
    expect(network.citingOf.get('W5')).toBeUndefined()
  })

  it('bounds the years and counts the works without one', () => {
    expect(network.untimed).toBe(1)
    expect(network.firstYear).toBe(1975)
    expect(network.lastYear).toBe(2001)
  })

  it('keeps the retrieval date and the topic', () => {
    expect(network.retrieved).toBe('2026-11-08T12:42:41Z')
    expect(network.topic.id).toBe('T11476')
  })

  it('reads a year as a local first of January', () => {
    const alpha = network.works[0]
    expect(alpha && new Date(yearTime(alpha) ?? 0).getFullYear()).toBe(1975)
  })
})

describe('search', () => {
  const network = prepare(sample)

  it('finds works by their title, best match first', () => {
    expect(searchWorks(network, 'alpha').map((work) => work.id)).toEqual(['W1'])
    expect(searchWorks(network, 'alph').map((work) => work.id)).toEqual(['W1'])
    expect(searchWorks(network, 'graph').map((work) => work.id)).toEqual(['W2'])
  })

  it('ranks a title that starts with the query before one that contains it', () => {
    const found = searchWorks(network, 'a').map((work) => work.title)
    expect(found.indexOf('Alpha')).toBeLessThan(found.indexOf('Beta graphs'))
  })

  it('finds works by their first author too', () => {
    expect(searchWorks(network, 'four').map((work) => work.id)).toEqual(['W4'])
    expect(searchWorks(network, 'one').map((work) => work.id)).toEqual(['W1'])
  })

  it('returns nothing on a blank query and limits the results', () => {
    expect(searchWorks(network, '   ')).toEqual([])
    expect(searchWorks(network, 'a', 2)).toHaveLength(2)
    expect(searchWorks(network, 'no such title anywhere')).toEqual([])
  })

  it('sorts the tied results by citations received, then more cited first', () => {
    const found = searchWorks(network, 'a')
    expect(found.map((work) => work.id)).toEqual(['W1', 'W2', 'W3', 'W4'])
  })
})

describe('top lists', () => {
  const network = prepare(sample)

  it('orders the neighbors of a work by citations received', () => {
    const cited = network.citedByOf.get('W1') ?? []
    expect(topWorks(cited).map((work) => work.id)).toEqual(['W2', 'W3'])
  })

  it('limits the lists to ten works', () => {
    const many = network.works.concat(network.works)
    expect(topWorks(many, 3)).toHaveLength(3)
  })
})

describe('definition', () => {
  const network = prepare(sample)
  const input = {
    works: network.works,
    links: network.links,
    maxIncoming: network.maxIncoming,
    firstYear: network.firstYear,
    lastYear: network.lastYear,
    arrows: null,
  }

  it('rebuilds with equal options, so a new definition rewrites no element', () => {
    const a = definitionOf(input)
    const b = definitionOf(input)
    expect(a.marks).toHaveLength(b.marks.length)
    a.marks.forEach((mark, index) => {
      expect(sameOptions(mark.options, b.marks[index]?.options ?? {})).toBe(true)
    })
  })

  it('lays out with forces', () => {
    const definition = definitionOf(input)
    expect(definition.layout?.name).toBe('force')
  })

  it('adds arrows on the cited edges only while a neighborhood is lit, and leaves the works alone', () => {
    const plain = definitionOf(input)
    const lit = definitionOf({ ...input, arrows: new Set(['l0>out', 'l1>in']) })
    expect(sameOptions(plain.marks[1]?.options ?? {}, lit.marks[1]?.options ?? {})).toBe(true)
    expect(sameOptions(plain.marks[0]?.options ?? {}, lit.marks[0]?.options ?? {})).toBe(false)
    expect(Object.keys(plain.marks[0]?.options ?? {})).not.toContain('arrow')
    expect(Object.keys(lit.marks[0]?.options ?? {})).toContain('arrow')
  })
})

describe('published data', () => {
  const read = () => JSON.parse(readFileSync(join(published, 'works.json'), 'utf8')) as RawDataset

  it('holds the full data set of the topic', () => {
    const data = read()
    const network = prepare(data)
    const ids = new Set(data.works.id)
    expect(data.works.id.length).toBeGreaterThan(20000)
    expect(data.cites.length).toBeGreaterThan(300000)
    expect(ids.size).toBe(data.works.id.length)
    expect(network.links).toHaveLength(data.cites.length / 2)
    expect(network.links.every((link) => ids.has(link.from) && ids.has(link.to))).toBe(true)
  })

  it('keeps every pair inside the bounds, without loops or duplicates', () => {
    const data = read()
    const total = data.works.id.length
    const seen = new Set<string>()
    for (let at = 0; at + 1 < data.cites.length; at += 2) {
      const citing = data.cites[at] ?? -1
      const cited = data.cites[at + 1] ?? -1
      expect(citing).toBeGreaterThanOrEqual(0)
      expect(citing).toBeLessThan(total)
      expect(cited).toBeGreaterThanOrEqual(0)
      expect(cited).toBeLessThan(total)
      expect(citing).not.toBe(cited)
      seen.add(`${citing}:${cited}`)
    }
    expect(seen.size).toBe(data.cites.length / 2)
  })

  it('carries years, titles and authors of the same lengths as the ids', () => {
    const data = read()
    const total = data.works.id.length
    expect(data.works.title).toHaveLength(total)
    expect(data.works.year).toHaveLength(total)
    expect(data.works.citations).toHaveLength(total)
    expect(data.works.author).toHaveLength(total)
  })

  it('stays inside the published year bounds, with works without a year', () => {
    const data = read()
    const network = prepare(data)
    for (const year of data.works.year) {
      if (year !== null) {
        expect(year).toBeGreaterThanOrEqual(1900)
        expect(year).toBeLessThanOrEqual(2026)
      }
    }
    expect(network.untimed).toBeGreaterThan(0)
    expect(network.firstYear).toBeGreaterThanOrEqual(1900)
    expect(network.lastYear).toBeLessThanOrEqual(2026)
  })

  it('matches the retrieval date of the snapshot', () => {
    const network = prepare(read())
    expect(network.retrieved).toMatch(/^2026-11-08T/)
    expect(network.topic.name).toContain('Graph')
  })

  it('ships the license text next to the data', () => {
    const text = readFileSync(join(published, 'LICENSE'), 'utf8')
    expect(text).toContain('CC0 1.0')
    expect(text).toContain('OpenAlex')
  })
})

describe('messages', () => {
  it('formats the counts of the interface', () => {
    expect(messages.status.shown(27721, 270157)).toBe('27,721 works, 270,157 citations')
  })
})
