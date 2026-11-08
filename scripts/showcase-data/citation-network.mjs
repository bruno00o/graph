import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { buildWorks, columnsOf, coreOf, graphOf } from './citations-build.mjs'

const topic = { id: 'T11476', name: 'Graph theory and applications' }
const endpoint = 'https://api.openalex.org/works'
const select =
  'id,display_name,publication_year,referenced_works,cited_by_count,primary_topic,authorships'
const perPage = 200
const userAgent = 'graph-data-builder/1.0'
const requestGap = 250
const pinnedPages = 'ba2990ad6f54a40dbdc577b4a000f32b3963fbae2879c62b887d8fd4b4a6f441'
const gzipLimit = 2.5 * 1024 * 1024
const output = resolve(import.meta.dirname, '../../docs/public/showcase-data/citation-network')

const { values } = parseArgs({
  allowPositionals: true,
  options: {
    raw: { type: 'string' },
    fetch: { type: 'string' },
    unpinned: { type: 'boolean', default: false },
  },
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function iso(date) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function fingerprintOf(raw) {
  const hash = createHash('sha256')
  const names = readdirSync(raw)
    .filter((name) => name.endsWith('.json.gz'))
    .sort()
  const pages = []
  for (const name of names) {
    const content = readFileSync(join(raw, name))
    hash.update(`${name}\n`)
    hash.update(content)
    pages.push(JSON.parse(gunzipSync(content).toString('utf8')))
  }
  assert(pages.length > 0, `no raw page in ${raw}`)
  return { pages, fingerprint: hash.digest('hex') }
}

function retrievedOf(folder) {
  const match = /^started \(UTC\): (\S+)/m.exec(readFileSync(join(folder, 'retrieved.txt'), 'utf8'))
  assert(match !== null, `no retrieved instant in ${join(folder, 'retrieved.txt')}`)
  return match[1]
}

async function getWorks(params) {
  const url = `${endpoint}?${new URLSearchParams(params).toString()}`
  for (let attempt = 1; attempt <= 12; attempt++) {
    const response = await fetch(url, {
      headers: { 'user-agent': userAgent, accept: 'application/json' },
    })
    if (response.ok) return response.json()
    const retryAfter = Number(response.headers.get('retry-after') ?? 0)
    if (response.status === 429 || response.status >= 500) {
      await sleep(Math.max(retryAfter * 1000, 1000))
      continue
    }
    throw new Error(`${url}: HTTP ${response.status}`)
  }
  throw new Error(`too many retries on ${url}`)
}

async function snapshot(folder) {
  const target = resolve(folder)
  mkdirSync(join(target, 'raw'), { recursive: true })
  const started = new Date()
  const groups = await getWorks({
    filter: `primary_topic.id:${topic.id}`,
    'group-by': 'publication_year',
  })
  const partitions = (groups.group_by ?? [])
    .filter((group) => group.key !== 'null' && group.key !== 'unknown')
    .map((group) => ({ key: group.key }))
  partitions.push({ key: 'null' })
  let requests = 1
  let sequence = 0
  let works = 0
  for (const partition of partitions) {
    const year = partition.key === 'null' ? 'null' : partition.key
    const filter = `primary_topic.id:${topic.id},publication_year:${year}`
    for (let page = 1; ; page++) {
      const response = await getWorks({
        filter,
        'per-page': String(perPage),
        page: String(page),
        select,
      })
      requests++
      const results = response.results ?? []
      works += results.length
      const content = Buffer.from(JSON.stringify(response), 'utf8')
      const name = `page-${String(sequence).padStart(4, '0')}-${partition.key}-${page}.json.gz`
      writeFileSync(join(target, 'raw', name), gzipSync(content, { level: 9 }))
      sequence++
      if (results.length < perPage) break
      await sleep(requestGap)
    }
    await sleep(requestGap)
  }
  const finished = new Date()
  writeFileSync(
    join(target, 'retrieved.txt'),
    `started (UTC): ${iso(started)}\nfinished (UTC): ${iso(finished)}\n`,
  )
  writeFileSync(
    join(target, 'query.txt'),
    `${[
      `Endpoint: https://api.openalex.org`,
      `Topic: ${topic.id} ${topic.name}, filter primary_topic.id:${topic.id}, downloaded in publication_year partitions.`,
      `Query: ${endpoint}?filter=primary_topic.id:${topic.id},publication_year:<YEAR>&per-page=${perPage}&page=<N>&select=${select}`,
      `Partition with no year: ${endpoint}?filter=primary_topic.id:${topic.id},publication_year:null&per-page=${perPage}&page=N&select=${select}`,
      `Counts by year: ${endpoint}?filter=primary_topic.id:${topic.id}&group-by=publication_year`,
      `User-Agent: ${userAgent}, with no key, no e-mail address and no mailto.`,
      `Pace: at most one request every ${requestGap} ms (${requests} requests, ${works} works).`,
    ].join('\n')}\n`,
  )
  console.log(`snapshot: ${requests} requests, ${works} works, ${sequence} pages in ${target}`)
}

const license = (retrieved) => `CC0 1.0 Universal

The data in works.json comes from OpenAlex (https://openalex.org), whose content is dedicated to
the public domain under CC0 1.0. The person who associated a work with this deed has dedicated the
work to the public domain by waiving all of his or her rights to the work worldwide under copyright
law, including all related and neighboring rights, to the extent allowed by law. You can copy,
modify, distribute and perform the work, even for commercial purposes, all without asking
permission.

Deed: https://creativecommons.org/publicdomain/zero/1.0/
Legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode

The x and y columns of works.json are node positions laid out once by the force layout of
@bruno00o/graph (the layout the app can rerun with forces) while the data file was built; they are
data, not a live layout.

works.json is a snapshot of a living database: the OpenAlex works of topic ${topic.id}
(${topic.name}), retrieved on ${retrieved}. Rebuild it byte for byte with:

pnpm docs:showcase-data citation-network --raw <snapshot folder>
`

let fingerprint = null
let pages = null
let retrieved = null
if (values.fetch) {
  await snapshot(values.fetch)
  const folder = resolve(values.fetch)
  const found = fingerprintOf(join(folder, 'raw'))
  pages = found.pages
  fingerprint = found.fingerprint
  retrieved = retrievedOf(folder)
} else if (values.raw) {
  const folder = resolve(values.raw)
  const found = fingerprintOf(join(folder, 'raw'))
  pages = found.pages
  fingerprint = found.fingerprint
  retrieved = retrievedOf(folder)
  if (!values.unpinned && fingerprint !== pinnedPages) {
    throw new Error(
      `The raw pages have fingerprint ${fingerprint}, the pinned one is ${pinnedPages}. ` +
        'Pass --unpinned to build from another snapshot.',
    )
  }
} else {
  throw new Error(
    'Pass --raw <snapshot folder> to rebuild from raw responses, or --fetch <folder> to query ' +
      'OpenAlex and write a new snapshot.',
  )
}

const full = buildWorks(pages)
const distForce = resolve(import.meta.dirname, '../../dist/layouts/force.js')
if (!existsSync(distForce)) {
  throw new Error(
    'dist/layouts/force.js is missing: the positions come from the layout of the library. ' +
      'Run pnpm build once, then run this script again.',
  )
}
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'))
const layoutSource = {
  name: 'force',
  options: { edgeLength: 40 },
  library: typeof pkg.version === 'string' ? pkg.version : 'unknown',
}
const started = performance.now()
const { force } = await import(distForce)
const placed = await new Promise((done) => {
  force({ edgeLength: 40 }).start(graphOf(full.works, full.cites), {
    progress: () => {},
    end: done,
  })
})
const layoutMs = performance.now() - started
console.log(
  `positions: the force layout ran for ${(layoutMs / 1000).toFixed(1)}s on the main thread`,
)

function slicePositions(origin, xy) {
  const kept = new Float32Array(origin.length * 2)
  for (const [at, original] of origin.entries()) {
    kept[at * 2] = xy[original * 2] ?? 0
    kept[at * 2 + 1] = xy[original * 2 + 1] ?? 0
  }
  return kept
}

let selected = { works: full.works, cites: full.cites, positions: placed }
const trials = []
if (
  gzipSync(
    Buffer.from(JSON.stringify(columnsOf(full.works, full.cites, placed, layoutSource)), 'utf8'),
    { level: 9 },
  ).length > gzipLimit
) {
  for (let minDegree = 2; minDegree <= 100; minDegree++) {
    const candidate = coreOf(full.works, full.cites, minDegree)
    const columns = columnsOf(
      candidate.works,
      candidate.cites,
      slicePositions(candidate.origin, placed),
      layoutSource,
    )
    const gzip = gzipSync(Buffer.from(JSON.stringify(columns), 'utf8'), { level: 9 }).length
    trials.push(
      `min degree ${minDegree}: ${candidate.works.length} works, ${candidate.cites.length} citations, ${gzip} bytes gzip`,
    )
    if (gzip <= gzipLimit) {
      selected = candidate
      break
    }
  }
  if (selected.works === full.works)
    throw new Error('no min degree keeps works.json under the gzip limit')
}

const columns = columnsOf(selected.works, selected.cites, selected.positions, layoutSource)
const document = {
  retrieved,
  topic,
  works: columns.works,
  cites: columns.cites,
  layout: columns.layout,
}
const json = Buffer.from(JSON.stringify(document), 'utf8')
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'works.json'), json)
writeFileSync(join(output, 'LICENSE'), license(retrieved))

console.log(
  `works.json: ${json.length} bytes, ${gzipSync(json, { level: 9 }).length} bytes gzip, sha256 ${sha256(json)}`,
)
console.log(
  `content: ${selected.works.length} works, ${selected.cites.length} citations (full graph: ${full.works.length} works, ${full.cites.length} citations)`,
)
console.log(`raw pages fingerprint: ${fingerprint ?? 'unpinned snapshot'}, pinned: ${pinnedPages}`)
for (const trial of trials) console.log(`core: ${trial}`)
