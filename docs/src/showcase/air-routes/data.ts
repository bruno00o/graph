export type DatasetId = 'europe' | 'world'

export interface Airport {
  readonly id: number
  readonly iata: string | null
  readonly icao: string | null
  readonly name: string
  readonly city: string | null
  readonly country: string
  readonly lat: number
  readonly lng: number
}

export interface RawRoute {
  readonly from: number
  readonly to: number
  readonly airline: number | string
}

export interface RawDataset {
  readonly airports: readonly Airport[]
  readonly routes: readonly RawRoute[]
}

export interface AirlineName {
  readonly id: number
  readonly name: string
}

export interface Place extends Airport {
  readonly code: string
  readonly routes: number
  readonly area: string | null
  readonly areaName: string | null
}

export interface Flight {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly airline: string
  readonly carrier: string
  readonly pair: string
}

export interface Carrier {
  readonly key: string
  readonly name: string
  readonly count: number
}

export interface Center {
  readonly longitude: number
  readonly latitude: number
}

export interface Network {
  readonly id: DatasetId
  readonly places: readonly Place[]
  readonly flights: readonly Flight[]
  readonly carriers: readonly Carrier[]
  readonly countries: readonly string[]
  readonly maxRoutes: number
  readonly center: Center
  readonly placeById: ReadonlyMap<number, Place>
  readonly flightsOf: ReadonlyMap<number, readonly Flight[]>
  readonly flightsOfPair: ReadonlyMap<string, readonly Flight[]>
}

export interface Filters {
  readonly country: string
  readonly airline: string
  readonly minRoutes: number
}

export interface Visible {
  readonly places: readonly Place[]
  readonly flights: readonly Flight[]
}

export interface Destination {
  readonly place: Place
  readonly links: ReadonlyArray<{
    readonly from: number
    readonly to: number
    readonly count: number
  }>
}

export const noFilters: Filters = { country: '', airline: '', minRoutes: 0 }

export const areaRadius = 35

const earthRadius = 6371

export function distance(a: Airport, b: Airport): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function clusterAreas(
  airports: readonly Airport[],
  routes: ReadonlyMap<number, number>,
  radius = areaRadius,
): Map<number, { readonly area: string; readonly name: string }> {
  const ordered = [...airports].sort(
    (a, b) => (routes.get(b.id) ?? 0) - (routes.get(a.id) ?? 0) || a.id - b.id,
  )
  const cells = new Map<string, Airport[]>()
  const cellOf = (lat: number, lng: number) => `${Math.floor(lat)}:${Math.floor(lng)}`
  for (const airport of ordered) {
    const key = cellOf(airport.lat, airport.lng)
    const list = cells.get(key)
    if (list) list.push(airport)
    else cells.set(key, [airport])
  }
  const taken = new Set<number>()
  const result = new Map<number, { area: string; name: string }>()
  for (const airport of ordered) {
    if (taken.has(airport.id)) continue
    taken.add(airport.id)
    const group = [airport]
    const spread = Math.ceil(1 / Math.max(0.2, Math.cos((airport.lat * Math.PI) / 180)))
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -spread; dLng <= spread; dLng++) {
        for (const other of cells.get(cellOf(airport.lat + dLat, airport.lng + dLng)) ?? []) {
          if (taken.has(other.id) || distance(airport, other) > radius) continue
          taken.add(other.id)
          group.push(other)
        }
      }
    }
    if (group.length < 2) continue
    const area = String(airport.id)
    const name = airport.city ?? airport.name
    for (const member of group) result.set(member.id, { area, name })
  }
  return result
}

export function codeOf(airport: Airport): string {
  return airport.iata ?? airport.icao ?? String(airport.id)
}

export function prepare(
  id: DatasetId,
  data: RawDataset,
  names: readonly AirlineName[],
  center: Center,
): Network {
  const nameOf = new Map(names.map((item) => [item.id, item.name]))
  const degree = new Map<number, number>()
  const flights: Flight[] = []
  for (const route of data.routes) {
    degree.set(route.from, (degree.get(route.from) ?? 0) + 1)
    degree.set(route.to, (degree.get(route.to) ?? 0) + 1)
    const airline = String(route.airline)
    const carrier =
      typeof route.airline === 'number' ? (nameOf.get(route.airline) ?? airline) : route.airline
    flights.push({
      id: `${airline}:${route.from}-${route.to}`,
      from: route.from,
      to: route.to,
      airline,
      carrier,
      pair: pairKey(route.from, route.to),
    })
  }
  const connected = data.airports.filter((airport) => (degree.get(airport.id) ?? 0) > 0)
  const areas = clusterAreas(connected, degree)
  const places: Place[] = connected.map((airport) => {
    const area = areas.get(airport.id)
    return {
      ...airport,
      code: codeOf(airport),
      routes: degree.get(airport.id) ?? 0,
      area: area?.area ?? null,
      areaName: area?.name ?? null,
    }
  })
  const flightsOf = new Map<number, Flight[]>()
  const flightsOfPair = new Map<string, Flight[]>()
  const push = <K>(map: Map<K, Flight[]>, key: K, flight: Flight) => {
    const list = map.get(key)
    if (list) list.push(flight)
    else map.set(key, [flight])
  }
  const counts = new Map<string, Carrier>()
  for (const flight of flights) {
    push(flightsOf, flight.from, flight)
    push(flightsOf, flight.to, flight)
    push(flightsOfPair, flight.pair, flight)
    const found = counts.get(flight.airline)
    counts.set(flight.airline, {
      key: flight.airline,
      name: flight.carrier,
      count: (found?.count ?? 0) + 1,
    })
  }
  return {
    id,
    places,
    flights,
    carriers: [...counts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    countries: [...new Set(places.map((place) => place.country))].sort((a, b) =>
      a.localeCompare(b),
    ),
    maxRoutes: Math.max(1, ...places.map((place) => place.routes)),
    center,
    placeById: new Map(places.map((place) => [place.id, place])),
    flightsOf,
    flightsOfPair,
  }
}

export function visibleOf(
  network: Network,
  filters: Filters,
  revealed: ReadonlySet<number>,
): Visible {
  const { country, airline, minRoutes } = filters
  const placeOf = network.placeById
  const shown = new Map<string, Flight>()
  for (const flight of network.flights) {
    const from = placeOf.get(flight.from)
    const to = placeOf.get(flight.to)
    if (!from || !to) continue
    const kept =
      (airline === '' || flight.airline === airline) &&
      (country === '' || from.country === country || to.country === country) &&
      from.routes >= minRoutes &&
      to.routes >= minRoutes
    if (kept) shown.set(flight.id, flight)
  }
  for (const key of revealed) {
    for (const flight of network.flightsOf.get(key) ?? []) shown.set(flight.id, flight)
  }
  const used = new Set<number>()
  for (const flight of shown.values()) {
    used.add(flight.from)
    used.add(flight.to)
  }
  for (const key of revealed) if (placeOf.has(key)) used.add(key)
  return {
    places: network.places.filter((place) => used.has(place.id)),
    flights: [...shown.values()],
  }
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function searchPlaces(network: Network, query: string, limit = 8): Place[] {
  const text = fold(query.trim())
  if (text === '') return []
  const scored: Array<{ readonly place: Place; readonly rank: number }> = []
  for (const place of network.places) {
    const code = fold(place.code)
    const iata = fold(place.iata ?? '')
    const name = fold(place.name)
    const city = fold(place.city ?? '')
    let rank = -1
    if (iata === text || code === text) rank = 0
    else if (iata.startsWith(text)) rank = 1
    else if (city.startsWith(text)) rank = 2
    else if (name.startsWith(text)) rank = 3
    else if (name.includes(text) || city.includes(text)) rank = 4
    if (rank >= 0) scored.push({ place, rank })
  }
  return scored
    .sort((a, b) => a.rank - b.rank || b.place.routes - a.place.routes || a.place.id - b.place.id)
    .slice(0, limit)
    .map((item) => item.place)
}

export function neighborsOf(network: Network, key: number): number[] {
  const found = new Set<number>()
  for (const flight of network.flightsOf.get(key) ?? []) {
    found.add(flight.from === key ? flight.to : flight.from)
  }
  return [...found]
}

export function destinationsOf(
  network: Network,
  members: readonly Place[],
  limit: number,
): Destination[] {
  const inside = new Set(members.map((place) => place.id))
  const byDestination = new Map<number, Map<number, number>>()
  for (const member of members) {
    for (const flight of network.flightsOf.get(member.id) ?? []) {
      const other = flight.from === member.id ? flight.to : flight.from
      if (inside.has(other)) continue
      const sources = byDestination.get(other) ?? new Map<number, number>()
      sources.set(member.id, (sources.get(member.id) ?? 0) + 1)
      byDestination.set(other, sources)
    }
  }
  const found: Array<Destination & { readonly total: number }> = []
  for (const [id, sources] of byDestination) {
    const place = network.placeById.get(id)
    if (!place) continue
    const links = [...sources].map(([from, count]) => ({ from, to: id, count }))
    found.push({ place, links, total: links.reduce((sum, link) => sum + link.count, 0) })
  }
  return found
    .sort((a, b) => b.total - a.total || a.place.id - b.place.id)
    .slice(0, limit)
    .map(({ place, links }) => ({ place, links }))
}

const centers: Record<DatasetId, Center> = {
  europe: { longitude: 12, latitude: 50 },
  world: { longitude: 10, latitude: 25 },
}

const fileOf: Record<DatasetId, string> = { europe: 'europe.json', world: 'world-top.json' }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return (await response.json()) as T
}

const cache = new Map<DatasetId, Promise<Network>>()
let airlines: Promise<readonly AirlineName[]> | null = null

export function loadNetwork(id: DatasetId): Promise<Network> {
  const found = cache.get(id)
  if (found) return found
  const base = `${import.meta.env.BASE_URL}showcase-data/air-routes/`
  airlines ??= fetchJson<readonly AirlineName[]>(`${base}airlines.json`)
  const loading = Promise.all([fetchJson<RawDataset>(`${base}${fileOf[id]}`), airlines]).then(
    ([data, names]) => prepare(id, data, names, centers[id]),
  )
  cache.set(id, loading)
  loading.catch(() => cache.delete(id))
  return loading
}
