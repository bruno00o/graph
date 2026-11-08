import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { buildLanguages } from './languages-build.mjs'

const endpoint = 'https://query.wikidata.org/sparql'
const pinnedResponse = 'd12042a214d45d7cea2404acdf8b33847a1fbc72a8575e244e7ae671fe44df26'
const output = resolve(import.meta.dirname, '../../docs/public/showcase-data/language-influences')
const query = readFileSync(join(import.meta.dirname, 'language-influences.sparql'), 'utf8')

const license = `CC0 1.0 Universal

The data in languages.json comes from Wikidata (https://www.wikidata.org), whose content is
dedicated to the public domain under CC0 1.0. The person who associated a work with this deed has
dedicated the work to the public domain by waiving all of his or her rights to the work worldwide
under copyright law, including all related and neighboring rights, to the extent allowed by law.
You can copy, modify, distribute and perform the work, even for commercial purposes, all without
asking permission.

Deed: https://creativecommons.org/publicdomain/zero/1.0/
Legal code: https://creativecommons.org/publicdomain/zero/1.0/legalcode

languages.json is a snapshot of a living database. It was built from the response of the query in
scripts/showcase-data/language-influences.sparql, retrieved on 2026-11-08 at 11:56:04 UTC.
`

const { values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    raw: { type: 'string' },
    fetch: { type: 'string' },
    unpinned: { type: 'boolean', default: false },
  },
})

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function response() {
  if (values.fetch) {
    const reply = await fetch(`${endpoint}?query=${encodeURIComponent(query)}`, {
      headers: {
        accept: 'application/sparql-results+json',
        'user-agent': 'graph-docs-showcase-data/1.0',
      },
    })
    if (!reply.ok) throw new Error(`${endpoint}: ${reply.status}`)
    const buffer = Buffer.from(await reply.arrayBuffer())
    writeFileSync(resolve(values.fetch), buffer)
    return { buffer, pinned: false }
  }
  if (!values.raw) {
    throw new Error(
      'Pass --raw <response.json> to rebuild from a saved response, or --fetch <file> to query ' +
        'Wikidata and save the response to <file>.',
    )
  }
  return { buffer: readFileSync(resolve(values.raw)), pinned: !values.unpinned }
}

const { buffer, pinned } = await response()
const found = sha256(buffer)
if (pinned && found !== pinnedResponse) {
  throw new Error(
    `The response has SHA-256 ${found}, the pinned one is ${pinnedResponse}. ` +
      'Pass --unpinned to build from another response.',
  )
}

const languages = buildLanguages(JSON.parse(buffer.toString('utf8')))
const json = Buffer.from(JSON.stringify(languages), 'utf8')
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'languages.json'), json)
writeFileSync(join(output, 'LICENSE'), license)
console.log(`response: SHA-256 ${found}`)
console.log(
  `languages.json: ${json.length} bytes, ${gzipSync(json, { level: 9 }).length} gzip, ` +
    `${languages.nodes.length} languages, ${languages.edges.length} influences`,
)
