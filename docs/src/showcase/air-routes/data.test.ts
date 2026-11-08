import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sameOptions } from '../../../../src/core/same-options'
import {
  type AirlineName,
  type Airport,
  clusterAreas,
  destinationsOf,
  distance,
  type Network,
  neighborsOf,
  noFilters,
  pairKey,
  prepare,
  type RawDataset,
  searchPlaces,
  visibleOf,
} from './data'
import { definitionOf, openedOf } from './definition'

const folder = fileURLToPath(new URL('.', import.meta.url))
const published = join(folder, '../../../public/showcase-data/air-routes')

function airport(id: number, code: string, city: string, lat: number, lng: number): Airport {
  return {
    id,
    iata: code,
    icao: null,
    name: `${city} Airport`,
    city,
    country: lat > 50 ? 'North' : 'South',
    lat,
    lng,
  }
}

const airports = [
  airport(1, 'AAA', 'Alpha', 48.0, 2.0),
  airport(2, 'AAB', 'Alpha', 48.2, 2.1),
  airport(3, 'BBB', 'Beta', 52.0, 8.0),
  airport(4, 'CCC', 'Gamma', 40.0, -3.0),
  airport(5, 'DDD', 'Delta', 40.05, -3.05),
  airport(6, 'EEE', 'Lonely', 60.0, 20.0),
]

const data: RawDataset = {
  airports,
  routes: [
    { from: 1, to: 3, airline: 10 },
    { from: 1, to: 3, airline: 11 },
    { from: 1, to: 3, airline: 'ZZ' },
    { from: 2, to: 3, airline: 10 },
    { from: 3, to: 4, airline: 10 },
    { from: 4, to: 5, airline: 12 },
  ],
}
const names: AirlineName[] = [
  { id: 10, name: 'Ten Air' },
  { id: 11, name: 'Eleven Air' },
  { id: 12, name: 'Twelve Air' },
]
const center = { longitude: 5, latitude: 45 }

function network(): Network {
  return prepare('europe', data, names, center)
}

describe('areas', () => {
  it('measures great circle distances in kilometers', () => {
    const paris = airport(1, 'CDG', 'Paris', 49.0097, 2.5479)
    const london = airport(2, 'LHR', 'London', 51.47, -0.4543)
    expect(distance(paris, london)).toBeGreaterThan(340)
    expect(distance(paris, london)).toBeLessThan(360)
    expect(distance(paris, paris)).toBe(0)
  })

  it('groups airports within the radius around the busiest one', () => {
    const routes = new Map([
      [1, 5],
      [2, 9],
      [3, 1],
      [4, 2],
      [5, 1],
    ])
    const areas = clusterAreas(airports.slice(0, 5), routes, 40)
    expect(areas.get(1)?.area).toBe('2')
    expect(areas.get(2)?.area).toBe('2')
    expect(areas.get(4)?.area).toBe(areas.get(5)?.area)
    expect(areas.has(3)).toBe(false)
  })

  it('does not chain airports beyond the radius of the leader', () => {
    const line = [0, 1, 2, 3].map((index) =>
      airport(index + 1, `L${index}`, 'Line', 10, index * 0.3),
    )
    const areas = clusterAreas(line, new Map([[1, 4]]), 40)
    const first = areas.get(1)?.area
    expect(first).toBe('1')
    expect(line.filter((place) => areas.get(place.id)?.area === first)).toHaveLength(2)
    expect(areas.get(4)?.area).not.toBe(first)
  })

  it('never groups two airports of different areas', () => {
    const areas = clusterAreas(airports, new Map(), 40)
    expect(areas.get(1)?.area).not.toBe(areas.get(4)?.area)
  })
})

describe('network', () => {
  it('counts routes per airport and keeps connected airports only', () => {
    const net = network()
    expect(net.places.map((place) => place.id)).toEqual([1, 2, 3, 4, 5])
    expect(net.placeById.get(3)?.routes).toBe(5)
    expect(net.flights).toHaveLength(6)
  })

  it('names airlines, keeping the raw code of an unknown one', () => {
    const net = network()
    expect(net.flights.map((flight) => flight.carrier)).toContain('Ten Air')
    expect(net.flights.find((flight) => flight.airline === 'ZZ')?.carrier).toBe('ZZ')
  })

  it('gives parallel flights of a pair the same pair key and distinct ids', () => {
    const net = network()
    const pair = net.flightsOfPair.get(pairKey(3, 1))
    expect(pair).toHaveLength(3)
    expect(new Set(pair?.map((flight) => flight.id)).size).toBe(3)
  })

  it('lists carriers by number of routes', () => {
    const net = network()
    expect(net.carriers[0]?.key).toBe('10')
    expect(net.carriers[0]?.count).toBe(3)
  })

  it('lists neighbors once', () => {
    expect(neighborsOf(network(), 3).sort()).toEqual([1, 2, 4])
  })

  it('finds the busiest destinations outside a group', () => {
    const net = network()
    const found = destinationsOf(
      net,
      [net.placeById.get(1), net.placeById.get(2)].flatMap((place) => (place ? [place] : [])),
      3,
    )
    expect(found.map((item) => item.place.id)).toEqual([3])
    expect(found[0]?.links).toHaveLength(2)
  })
})

describe('filters', () => {
  it('shows everything without a filter', () => {
    const net = network()
    const visible = visibleOf(net, noFilters, new Set())
    expect(visible.flights).toHaveLength(6)
    expect(visible.places).toHaveLength(5)
  })

  it('keeps the routes of one airline and the airports they join', () => {
    const net = network()
    const visible = visibleOf(net, { ...noFilters, airline: '11' }, new Set())
    expect(visible.flights).toHaveLength(1)
    expect(visible.places.map((place) => place.id)).toEqual([1, 3])
  })

  it('keeps the routes that touch a country, with their other end', () => {
    const net = network()
    const visible = visibleOf(net, { ...noFilters, country: 'North' }, new Set())
    expect(visible.flights.every((flight) => flight.from === 3 || flight.to === 3)).toBe(true)
    expect(visible.places.map((place) => place.id)).toEqual([1, 2, 3, 4])
  })

  it('drops the routes of airports below the minimum', () => {
    const net = network()
    const visible = visibleOf(net, { ...noFilters, minRoutes: 4 }, new Set())
    expect(visible.flights).toHaveLength(0)
    expect(visible.places).toHaveLength(0)
  })

  it('shows every route of an opened airport whatever the filters', () => {
    const net = network()
    const filters = { ...noFilters, airline: '11' }
    const visible = visibleOf(net, filters, new Set([3]))
    expect(visible.flights).toHaveLength(5)
    expect(visible.places.map((place) => place.id)).toEqual([1, 2, 3, 4])
  })
})

describe('search', () => {
  it('ranks an exact code before names', () => {
    const net = network()
    expect(searchPlaces(net, 'bbb')[0]?.id).toBe(3)
  })

  it('matches names and cities without accents or case', () => {
    const net = network()
    expect(searchPlaces(net, 'ALPHA').map((place) => place.id)).toEqual([1, 2])
    expect(searchPlaces(net, 'gamma airport').map((place) => place.id)).toEqual([4])
  })

  it('returns nothing for an empty query and ignores airports without routes', () => {
    const net = network()
    expect(searchPlaces(net, '  ')).toEqual([])
    expect(searchPlaces(net, 'lonely')).toEqual([])
  })

  it('limits the results', () => {
    expect(searchPlaces(network(), 'a', 2)).toHaveLength(2)
  })
})

describe('definition', () => {
  const net = network()
  const visible = visibleOf(net, noFilters, new Set())
  const input = {
    places: visible.places,
    flights: visible.flights,
    opened: openedOf([]),
    mode: 'classic' as const,
    grouped: true,
    layout: 'geo' as const,
    center,
    scale: 16,
  }

  it('suffixes the keys of opened flights so they never collide', () => {
    const [first] = visible.flights
    expect(first && openedOf([first])[0]?.id).toBe(`${first?.id}~`)
  })

  it('rebuilds with equal options, so a new definition rewrites no element', () => {
    const a = definitionOf(input)
    const b = definitionOf(input)
    expect(a.marks).toHaveLength(b.marks.length)
    a.marks.forEach((mark, index) => {
      expect(sameOptions(mark.options, b.marks[index]?.options ?? {})).toBe(true)
    })
  })

  it('adds the group mark only when grouping is on', () => {
    expect(definitionOf(input).marks).toHaveLength(4)
    expect(definitionOf({ ...input, grouped: false }).marks).toHaveLength(3)
  })

  it('drops the layout on a map', () => {
    expect(definitionOf({ ...input, mode: 'map' }).layout).toBeNull()
    expect(definitionOf(input).layout?.name).toBe('geo')
  })
})

describe('published data', () => {
  for (const file of ['europe.json', 'world-top.json']) {
    it(`${file} holds airports and routes that join them`, () => {
      const set = JSON.parse(readFileSync(join(published, file), 'utf8')) as RawDataset
      const ids = new Set(set.airports.map((item) => item.id))
      expect(set.airports.length).toBeGreaterThan(500)
      expect(set.routes.length).toBeGreaterThan(5000)
      expect(set.routes.every((route) => ids.has(route.from) && ids.has(route.to))).toBe(true)
      expect(set.routes.every((route) => route.from < route.to)).toBe(true)
    })
  }

  it('names the airlines the routes use', () => {
    const list = JSON.parse(readFileSync(join(published, 'airlines.json'), 'utf8')) as AirlineName[]
    const set = JSON.parse(readFileSync(join(published, 'europe.json'), 'utf8')) as RawDataset
    const known = new Set(list.map((item) => item.id))
    const unknown = set.routes.filter(
      (route) => typeof route.airline === 'number' && !known.has(route.airline),
    )
    expect(unknown).toEqual([])
  })

  it('ships the license text next to the data', () => {
    const text = readFileSync(join(published, 'LICENSE'), 'utf8')
    expect(text).toContain('Open Database License')
  })
})
