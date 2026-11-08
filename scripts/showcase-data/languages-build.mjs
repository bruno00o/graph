const pairSeparator = '\u001E'
const listSeparator = '\u001F'
const firstYear = 1940
const lastYear = 2026

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function entityOrNull(uri) {
  return /\/(Q\d+)$/.exec(uri)?.[1] ?? null
}

function entity(uri) {
  const id = entityOrNull(uri)
  assert(id !== null, `not a Wikidata entity URI: ${uri}`)
  return id
}

function listOf(binding) {
  return binding === undefined || binding.value === '' ? [] : binding.value.split(listSeparator)
}

function yearOf(record) {
  const chosen = record.inception ?? record.publication
  if (chosen === null) return null
  const match = /^\+?(-?\d{4})/.exec(chosen)
  assert(match !== null, `unparsable date for ${record.id}: ${chosen}`)
  const year = Number(match[1])
  return year < firstYear || year > lastYear ? null : year
}

function readRecords(bindings) {
  const records = new Map()
  for (const binding of bindings) {
    assert(binding.lang !== undefined, 'binding without ?lang')
    const id = entity(binding.lang.value)
    if (records.has(id)) continue
    const label = binding.langLabel?.value ?? ''
    records.set(id, {
      id,
      name: label === '' ? id : label,
      inception: binding.inception?.value ?? null,
      publication: binding.publication?.value ?? null,
      paradigmPairs: listOf(binding.paradigms),
      influenceTargets: listOf(binding.influences),
    })
  }
  return records
}

function paradigmsOf(record) {
  const labels = new Set()
  for (const pair of record.paradigmPairs) {
    const separator = pair.indexOf(pairSeparator)
    assert(separator !== -1, `malformed paradigm pair for ${record.id}`)
    const paradigm = entityOrNull(pair.slice(0, separator))
    if (paradigm === null) continue
    const label = pair.slice(separator + 1)
    labels.add(label === '' ? paradigm : label)
  }
  return [...labels].sort()
}

function numberOf(id) {
  return Number(id.slice(1))
}

export function buildLanguages(raw) {
  const records = readRecords(raw.results.bindings)
  const languages = new Map()
  for (const record of records.values()) {
    languages.set(record.id, {
      id: record.id,
      name: record.name,
      year: yearOf(record),
      paradigms: paradigmsOf(record),
    })
  }

  const links = new Map()
  for (const record of records.values()) {
    for (const uri of record.influenceTargets) {
      const target = entityOrNull(uri)
      if (target === null || target === record.id || !languages.has(target)) continue
      const key = `${record.id}-${target}`
      if (!links.has(key)) links.set(key, { source: record.id, target })
    }
  }

  const linked = new Set()
  for (const link of links.values()) {
    linked.add(link.source)
    linked.add(link.target)
  }
  const nodes = [...languages.values()]
    .filter((language) => linked.has(language.id))
    .sort((a, b) => numberOf(a.id) - numberOf(b.id))
  const edges = [...links.values()].sort(
    (a, b) => numberOf(a.source) - numberOf(b.source) || numberOf(a.target) - numberOf(b.target),
  )

  return {
    nodes,
    edges: edges.map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
    })),
  }
}
