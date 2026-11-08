const numbers = new Intl.NumberFormat('en-US')

export function count(value: number): string {
  return numbers.format(value)
}

export const dataAttribution = {
  before: 'Data: ',
  name: 'OpenFlights',
  url: 'https://openflights.org/data.php',
  licenseText: 'Open Database License (ODbL) v1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
} as const

export const messages = {
  graphLabel: (airports: number, routes: number) =>
    `${count(airports)} airports and ${count(routes)} routes`,
  mapLabel: (airports: number, routes: number) =>
    `${count(airports)} airports and ${count(routes)} routes on a map`,
  loading: 'Loading the routes',
  failed: 'The data could not be loaded.',
  retry: 'Try again',
  panel: 'Controls',
  search: {
    title: 'Find an airport',
    label: 'Airport code or name',
    placeholder: 'LHR, Heathrow, Lisbon',
    none: 'No airport matches.',
    results: 'Matching airports',
    result: (code: string, name: string, city: string | null, country: string) =>
      `${code}, ${name}${city ? `, ${city}` : ''}, ${country}`,
  },
  dataset: {
    title: 'Data set',
    europe: 'Europe',
    world: 'World, top 1,000',
    summary: (airports: number, routes: number) =>
      `${count(airports)} airports, ${count(routes)} routes`,
  },
  view: {
    title: 'View',
    classic: 'Graph',
    map: 'Map',
    layout: 'Layout',
    layouts: { geo: 'Geography', force: 'Forces', rings: 'Rings by routes' },
    basemap: 'Base map',
    group: 'Group close airports',
    groupHint: (radius: number) => `Airports within ${radius} km share one node.`,
  },
  filters: {
    title: 'Filters',
    country: 'Country',
    anyCountry: 'Any country',
    airline: 'Airline',
    anyAirline: 'Any airline',
    airlineOption: (name: string, routes: number) => `${name} (${count(routes)})`,
    minRoutes: 'Minimum routes',
    minRoutesValue: (value: number) => `${value} or more`,
    reset: 'Reset the filters',
  },
  status: {
    shown: (airports: number, routes: number) =>
      `${count(airports)} airports, ${count(routes)} routes shown`,
    revealed: (revealed: number) =>
      revealed === 0 ? '' : `${count(revealed)} airport${revealed === 1 ? '' : 's'} opened`,
    hint: 'Double-click an airport to show all its routes, a merged route to open it into its airlines.',
  },
  details: {
    airport: (code: string, name: string) => `${code}, ${name}`,
    place: (city: string | null, country: string) => (city ? `${city}, ${country}` : country),
    routes: (value: number) => `${count(value)} route${value === 1 ? '' : 's'}`,
    airlines: (value: number) => `${count(value)} airline${value === 1 ? '' : 's'}`,
    pair: (from: string, to: string) => `${from} to ${to}`,
    area: (name: string, airports: number) => `${name}: ${airports} airports`,
    open: 'Double-click to open',
    close: 'Double-click to close',
  },
  preview: {
    label: (name: string) => `Airports of ${name} and their busiest destinations`,
  },
  map: {
    attribution: 'Base map',
    failed: 'This base map could not be loaded.',
  },
  actions: {
    fit: 'Fit',
    clear: 'Clear',
  },
} as const

export interface Basemap {
  readonly id: string
  readonly label: string
  readonly style: string
  readonly scheme: 'light' | 'dark'
  readonly credit: ReadonlyArray<{ readonly text: string; readonly url: string }>
}

const openFreeMap = [
  { text: 'OpenFreeMap', url: 'https://openfreemap.org' },
  { text: 'OpenMapTiles', url: 'https://www.openmaptiles.org/' },
  { text: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
] as const

const demo: Basemap = {
  id: 'demo',
  label: 'MapLibre demo',
  style: 'https://demotiles.maplibre.org/style.json',
  scheme: 'light',
  credit: [
    { text: 'MapLibre', url: 'https://maplibre.org' },
    { text: 'Natural Earth', url: 'https://www.naturalearthdata.com' },
  ],
}

export const positron: Basemap = {
  id: 'positron',
  label: 'Positron',
  style: 'https://tiles.openfreemap.org/styles/positron',
  scheme: 'light',
  credit: openFreeMap,
}

const liberty: Basemap = {
  id: 'liberty',
  label: 'Liberty',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  scheme: 'light',
  credit: openFreeMap,
}

export const dark: Basemap = {
  id: 'dark',
  label: 'Dark',
  style: 'https://tiles.openfreemap.org/styles/dark',
  scheme: 'dark',
  credit: openFreeMap,
}

export const basemaps: readonly Basemap[] = [positron, liberty, dark, demo]
