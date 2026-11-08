import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const commit = '115067fd23d1221f93edfda3701a69e106672953'
const base = `https://raw.githubusercontent.com/jpatokal/openflights/${commit}/data`
const licenseUrl = `${base}/LICENSE`
const sources = {
  'airports.dat': '9387cdb38df5bd664da823f8ccb69fdd9b33a1888f5b7cca09c34a3cd9ff59f9',
  'airlines.dat': '39be1a432e8b04ebc12860c29281c974a9cb52169c82b2456a835d66ab1548a1',
  'routes.dat': 'bd373706238134f619c624c606dccc74c05c2582a977c489c81de501735f2390',
}
const output = resolve(import.meta.dirname, '../docs/public/showcase-data/air-routes')
const missing = '\\N'
const topAirports = 1000

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function download(url) {
  const response = await fetch(url)
  assert(response.ok, `${url}: ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

function decode(buffer) {
  let text = ''
  let at = 0
  while (at < buffer.length) {
    const byte = buffer[at]
    let size = 0
    if (byte < 0x80) size = 1
    else if (byte >= 0xc2 && byte <= 0xdf) size = 2
    else if (byte >= 0xe0 && byte <= 0xef && !(byte === 0xe0 && buffer[at + 1] < 0xa0)) size = 3
    else if (byte >= 0xf0 && byte <= 0xf4 && !(byte === 0xf0 && buffer[at + 1] < 0x90)) size = 4
    let valid = size > 0
    for (let step = 1; valid && step < size; step++) {
      const next = buffer[at + step]
      if (next === undefined || next < 0x80 || next > 0xbf) valid = false
    }
    if (valid) {
      text += buffer.toString('utf8', at, at + size)
      at += size
    } else {
      text += String.fromCharCode(byte)
      at++
    }
  }
  return text
}

function parseLine(line) {
  const columns = []
  let at = 0
  for (;;) {
    if (at === line.length) {
      columns.push('')
      return columns
    }
    if (line[at] === '"') {
      let value = ''
      at++
      for (;;) {
        assert(at < line.length, 'unterminated quote')
        if (line[at] === '"') {
          if (line[at + 1] === '"') {
            value += '"'
            at += 2
            continue
          }
          break
        }
        value += line[at]
        at++
      }
      at++
      columns.push(value)
      if (at === line.length) return columns
      assert(line[at] === ',', `unexpected character after quote: ${line.slice(0, 80)}`)
      at++
    } else {
      const comma = line.indexOf(',', at)
      if (comma === -1) {
        columns.push(line.slice(at))
        return columns
      }
      columns.push(line.slice(at, comma))
      at = comma + 1
    }
  }
}

function rowsOf(buffer, width) {
  const rows = []
  for (const raw of decode(buffer).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line === '') continue
    const columns = parseLine(line)
    assert(columns.length >= width, `expected ${width} columns: ${line.slice(0, 80)}`)
    rows.push(columns)
  }
  return rows
}

function text(value) {
  return value === missing || value === '' ? null : value
}

function number(value) {
  const parsed = Number(value)
  assert(Number.isFinite(parsed), `not a number: ${value}`)
  return parsed
}

const files = {}
for (const [name, hash] of Object.entries(sources)) {
  const buffer = await download(`${base}/${name}`)
  const found = createHash('sha256').update(buffer).digest('hex')
  assert(found === hash, `${name}: expected ${hash}, found ${found}`)
  files[name] = buffer
}

const airports = rowsOf(files['airports.dat'], 14)
  .map(($) => ({
    id: number($[0]),
    iata: text($[4]),
    icao: text($[5]),
    name: $[1],
    city: text($[2]),
    country: $[3],
    lat: number($[6]),
    lng: number($[7]),
    zone: $[11],
  }))
  .sort((a, b) => a.id - b.id)
const airportById = new Map(airports.map((airport) => [String(airport.id), airport]))
const airportByCode = new Map()
for (const field of ['iata', 'icao']) {
  for (const airport of airports) {
    const code = airport[field]
    if (code !== null && !airportByCode.has(code)) airportByCode.set(code, airport)
  }
}

const airlineRows = rowsOf(files['airlines.dat'], 8)
const airlines = airlineRows
  .map(($) => ({ id: number($[0]), name: $[1], iata: text($[3]), icao: text($[4]) }))
  .sort((a, b) => a.id - b.id)
const airlineById = new Map(airlines.map((airline) => [String(airline.id), airline]))
const airlineByCode = new Map()
for (const field of ['iata', 'icao']) {
  for (const airline of airlines) {
    const code = airline[field]
    if (code !== null && code !== '-' && code !== 'N/A' && !airlineByCode.has(code)) {
      airlineByCode.set(code, airline)
    }
  }
}

function airportOf(code, id) {
  return (id === missing ? undefined : airportById.get(id)) ?? airportByCode.get(code)
}

const pairs = new Map()
for (const $ of rowsOf(files['routes.dat'], 9)) {
  const from = airportOf($[2], $[3])
  const to = airportOf($[4], $[5])
  if (from === undefined || to === undefined || from === to) continue
  const known = ($[1] === missing ? undefined : airlineById.get($[1])) ?? airlineByCode.get($[0])
  const airline = known === undefined ? $[0] : known.id
  const low = Math.min(from.id, to.id)
  const high = Math.max(from.id, to.id)
  const key = `${airline}|${low}|${high}`
  if (!pairs.has(key)) pairs.set(key, { from: low, to: high, airline })
}
const routes = [...pairs.values()].sort(
  (a, b) =>
    a.from - b.from ||
    a.to - b.to ||
    String(a.airline).localeCompare(String(b.airline), 'en', { numeric: true }),
)

const degree = new Map()
for (const route of routes) {
  degree.set(route.from, (degree.get(route.from) ?? 0) + 1)
  degree.set(route.to, (degree.get(route.to) ?? 0) + 1)
}

function subset(ids) {
  const wanted = new Set(ids)
  const chosen = routes.filter((route) => wanted.has(route.from) && wanted.has(route.to))
  const used = new Set(chosen.flatMap((route) => [route.from, route.to]))
  return {
    airports: airports
      .filter((airport) => used.has(airport.id))
      .map(({ zone, ...airport }) => airport),
    routes: chosen,
  }
}

const europe = subset(
  airports
    .filter(
      (airport) => airport.zone.startsWith('Europe/') || airport.zone === 'Atlantic/Reykjavik',
    )
    .map((airport) => airport.id),
)
const world = subset(
  [...degree.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, topAirports)
    .map(([id]) => id),
)

const used = new Set([...europe.routes, ...world.routes].map((route) => route.airline))
const names = airlines
  .filter((airline) => used.has(airline.id))
  .map((airline) => ({ id: airline.id, name: airline.name }))

mkdirSync(output, { recursive: true })
const written = []
function write(name, value) {
  const buffer = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  writeFileSync(join(output, name), buffer)
  written.push(`${name}: ${buffer.length} bytes, ${gzipSync(buffer, { level: 9 }).length} gzip`)
}
write('europe.json', europe)
write('world-top.json', world)
write('airlines.json', names)
write('LICENSE', (await download(licenseUrl)).toString('utf8'))
console.log(written.join('\n'))
console.log(
  `europe: ${europe.airports.length} airports, ${europe.routes.length} routes; ` +
    `world: ${world.airports.length} airports, ${world.routes.length} routes`,
)
