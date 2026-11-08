import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPathFinder, edges, nodes } from '@bruno00o/graph'
import { describe, expect, it } from 'vitest'
import { sameOptions } from '../../../../src/core/same-options'
import {
  coloredParadigms,
  commonestParadigm,
  degreeOf,
  mainParadigms,
  paradigmCounts,
  paradigmName,
  prepare,
  type RawDataset,
  searchLanguages,
  yearTime,
} from './data'
import { definitionOf } from './definition'
import { messages } from './messages'
import { scopeOf } from './scope'

const folder = fileURLToPath(new URL('.', import.meta.url))
const published = join(folder, '../../../public/showcase-data/language-influences')

function language(id: string, name: string, year: number | null, paradigms: string[]) {
  return { id, name, year, paradigms }
}

const sample: RawDataset = {
  nodes: [
    language('Q1', 'Alpha', 1960, ['procedural', 'imperative']),
    language('Q2', 'Beta', 1970, ['imperative']),
    language('Q3', 'Gamma', 1980, ['object-oriented programming', 'imperative']),
    language('Q4', 'Delta', null, []),
    language('Q5', 'Lonely', 1990, ['logic programming']),
    language('Q6', 'Epsilon', 2000, ['imperative', 'logic programming']),
  ],
  edges: [
    { id: 'Q2-Q1', source: 'Q2', target: 'Q1' },
    { id: 'Q3-Q2', source: 'Q3', target: 'Q2' },
    { id: 'Q4-Q3', source: 'Q4', target: 'Q3' },
    { id: 'Q1-Q3', source: 'Q1', target: 'Q3' },
    { id: 'Q6-Q4', source: 'Q6', target: 'Q4' },
  ],
}

describe('main paradigm', () => {
  it('counts each paradigm once per language', () => {
    const counts = paradigmCounts([language('Q1', 'A', 1, ['x', 'x', 'y'])])
    expect(counts.get('x')).toBe(1)
  })

  it('picks the paradigm shared with the most languages, then the first by name', () => {
    const counts = new Map([
      ['b', 3],
      ['a', 3],
      ['c', 1],
    ])
    expect(commonestParadigm(['c', 'b', 'a'], counts)).toBe('a')
    expect(commonestParadigm(['c'], counts)).toBe('c')
    expect(commonestParadigm([], counts)).toBeNull()
  })

  it('colors the commonest paradigms and groups the rest', () => {
    const { main, categories } = mainParadigms(sample.nodes)
    expect(main.get('Q4')).toBe(messages.paradigm.none)
    expect(categories.at(-1)).toBe(messages.paradigm.none)
    expect(new Set(main.values())).toEqual(new Set(categories))
    expect(categories.length).toBeLessThanOrEqual(coloredParadigms + 2)
  })

  it('names a paradigm without its trailing word', () => {
    expect(paradigmName('object-oriented programming')).toBe('Object-oriented')
    expect(paradigmName('concurrent computing')).toBe('Concurrent computing')
  })
})

describe('network', () => {
  const network = prepare(sample)

  it('points influences from the influencing language to the influenced one', () => {
    const first = network.influences.find((item) => item.id === 'Q1-Q2')
    expect(first).toEqual({ id: 'Q1-Q2', from: 'Q1', to: 'Q2' })
    expect(network.influencersOf.get('Q2')?.map((item) => item.id)).toEqual(['Q1'])
    expect(network.influencedOf.get('Q1')?.map((item) => item.id)).toEqual(['Q2'])
  })

  it('counts the languages with no year and bounds the years', () => {
    expect(network.untimed).toBe(1)
    expect(network.firstYear).toBe(1960)
    expect(network.lastYear).toBe(2000)
  })

  it('searches by name, best match first', () => {
    expect(searchLanguages(network, 'alpha').map((item) => item.id)).toEqual(['Q1'])
    expect(searchLanguages(network, 'ta').map((item) => item.name)).toEqual(['Beta', 'Delta'])
    expect(searchLanguages(network, '  ')).toEqual([])
    expect(searchLanguages(network, 'a', 2)).toHaveLength(2)
  })

  it('ranks a name that starts with the query before one that contains it', () => {
    const found = searchLanguages(network, 'e').map((item) => item.name)
    expect(found.indexOf('Epsilon')).toBeLessThan(found.indexOf('Beta'))
  })

  it('reads the year as a local date, so the calendar of the timeline lines up', () => {
    const alpha = network.byId.get('Q1')
    const delta = network.byId.get('Q4')
    expect(alpha && new Date(yearTime(alpha) ?? 0).getFullYear()).toBe(1960)
    expect(delta && yearTime(delta)).toBeNull()
  })

  it('counts the links of a language in both directions', () => {
    expect(degreeOf(network, 'Q3')).toBe(3)
  })
})

describe('scope of a lineage', () => {
  const network = prepare(sample)

  it('keeps the languages behind and after, to a depth', () => {
    const near = scopeOf(network, 'Q2', 1)
    expect(near?.languages.map((item) => item.id)).toEqual(['Q1', 'Q2', 'Q3'])
    const far = scopeOf(network, 'Q2', 'all')
    expect(far?.languages.map((item) => item.id)).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q6'])
  })

  it('returns nothing for a language that is not in the data', () => {
    expect(scopeOf(network, 'Q99', 1)).toBeNull()
  })

  it('agrees with the reach of a path finder on the same data', () => {
    const finder = createPathFinder({
      marks: [
        nodes(network.languages),
        edges(network.influences, { source: 'from', target: 'to' }),
      ],
    })
    for (const language of network.languages) {
      for (const depth of [1, 2, 'all'] as const) {
        const options = depth === 'all' ? {} : { maxCost: depth }
        const before = finder.reach(language.id, { ...options, direction: 'backward' })
        const after = finder.reach(language.id, { ...options, direction: 'forward' })
        const scope = scopeOf(network, language.id, depth)
        expect(new Set(scope?.languages.map((item) => item.id))).toEqual(
          new Set([...before.nodes, ...after.nodes]),
        )
        expect(new Set(scope?.influences.map((item) => item.id))).toEqual(
          new Set([...before.edges, ...after.edges]),
        )
      }
    }
    finder.destroy()
  })
})

describe('definition', () => {
  const network = prepare(sample)
  const input = {
    languages: network.languages,
    influences: network.influences,
    categories: network.categories,
    grouped: false,
    layout: 'layers' as const,
    direction: 'right' as const,
  }

  it('rebuilds with equal options, so a new definition rewrites no element', () => {
    const a = definitionOf(input)
    const b = definitionOf(input)
    expect(a.marks).toHaveLength(b.marks.length)
    a.marks.forEach((mark, index) => {
      expect(sameOptions(mark.options, b.marks[index]?.options ?? {})).toBe(true)
    })
  })

  it('adds the group mark only when grouping is on', () => {
    expect(definitionOf(input).marks).toHaveLength(2)
    expect(definitionOf({ ...input, grouped: true }).marks).toHaveLength(3)
  })

  it('switches the layout and its direction', () => {
    expect(definitionOf(input).layout?.name).toBe('layers')
    expect(definitionOf({ ...input, layout: 'force' }).layout?.name).toBe('force')
    expect(
      sameOptions(
        definitionOf(input).layout?.options ?? {},
        definitionOf({ ...input, direction: 'down' }).layout?.options ?? {},
      ),
    ).toBe(false)
  })
})

describe('published data', () => {
  const data = JSON.parse(readFileSync(join(published, 'languages.json'), 'utf8')) as RawDataset
  const network = prepare(data)

  it('holds languages and influences that join them', () => {
    const ids = new Set(data.nodes.map((item) => item.id))
    expect(data.nodes.length).toBeGreaterThan(500)
    expect(data.edges.length).toBeGreaterThan(1000)
    expect(data.edges.every((item) => ids.has(item.source) && ids.has(item.target))).toBe(true)
    expect(data.edges.every((item) => item.source !== item.target)).toBe(true)
    expect(new Set(data.edges.map((item) => item.id)).size).toBe(data.edges.length)
  })

  it('keeps every language linked, with years in the range of the data', () => {
    const linked = new Set(data.edges.flatMap((item) => [item.source, item.target]))
    expect(data.nodes.every((item) => linked.has(item.id))).toBe(true)
    expect(network.firstYear).toBe(1942)
    expect(network.lastYear).toBe(2025)
    expect(network.untimed).toBeGreaterThan(50)
  })

  it('has reciprocal influences, which the layered layout has to turn around', () => {
    const keys = new Set(data.edges.map((item) => item.id))
    const pairs = data.edges.filter(
      (item) => item.source < item.target && keys.has(`${item.target}-${item.source}`),
    )
    expect(pairs.length).toBe(8)
  })

  it('colors at most the six commonest main paradigms and gives each language one', () => {
    expect(network.categories.length).toBeLessThanOrEqual(coloredParadigms + 2)
    const known = new Set(network.categories)
    expect(network.languages.every((item) => known.has(item.main))).toBe(true)
  })

  it('ships the license text next to the data', () => {
    const text = readFileSync(join(published, 'LICENSE'), 'utf8')
    expect(text).toContain('CC0 1.0')
    expect(text).toContain('Wikidata')
  })
})
