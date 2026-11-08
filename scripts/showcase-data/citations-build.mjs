const firstYear = 1900
const lastYear = 2026
const titleLimit = 120

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function workId(uri) {
  const match = /\/(W\d+)$/.exec(uri)
  assert(match !== null, `not an OpenAlex work URI: ${uri}`)
  return match[1]
}

function numberOf(id) {
  return Number(id.slice(1))
}

function titleOf(work) {
  const title = work.display_name ?? ''
  const id = workId(work.id)
  return title === '' ? id : Array.from(title).slice(0, titleLimit).join('')
}

function yearOf(work) {
  const year = work.publication_year
  if (year === null || year === undefined) return null
  return year < firstYear || year > lastYear ? null : year
}

function readWorks(pages) {
  const records = new Map()
  for (const page of pages) {
    for (const work of page.results ?? []) {
      const id = workId(work.id)
      if (records.has(id)) continue
      assert(Number.isInteger(work.cited_by_count), `missing cited_by_count for ${id}`)
      const authors = work.authorships ?? []
      const author = authors.length > 0 ? (authors[0]?.author?.display_name ?? null) : null
      records.set(id, {
        id,
        title: titleOf(work),
        year: yearOf(work),
        citations: work.cited_by_count,
        author: author === '' ? null : author,
        targets: (work.referenced_works ?? []).map((uri) => workId(uri)),
      })
    }
  }
  return records
}

function pairsOf(records) {
  const edges = new Set()
  for (const record of records.values()) {
    for (const target of record.targets) {
      if (target === record.id || !records.has(target)) continue
      edges.add(`${record.id}|${target}`)
    }
  }
  return edges
}

export function buildWorks(pages) {
  const records = readWorks(pages)
  const edges = pairsOf(records)
  const linked = new Set()
  for (const edge of edges) {
    const [source, target] = edge.split('|')
    linked.add(source)
    linked.add(target)
  }
  const works = [...records.values()]
    .filter((record) => linked.has(record.id))
    .map((record) => ({
      id: record.id,
      title: record.title,
      year: record.year,
      citations: record.citations,
      author: record.author,
    }))
    .sort((a, b) => numberOf(a.id) - numberOf(b.id))
  const positionOf = new Map(works.map((work, index) => [work.id, index]))
  const cites = [...edges]
    .map((edge) => {
      const [source, target] = edge.split('|')
      return [positionOf.get(source), positionOf.get(target)]
    })
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return { works, cites }
}

export function coreOf(works, cites, minDegree) {
  const degree = new Map()
  for (const [source, target] of cites) {
    degree.set(source, (degree.get(source) ?? 0) + 1)
    degree.set(target, (degree.get(target) ?? 0) + 1)
  }
  const kept = new Set()
  for (const [index] of works.entries()) {
    if ((degree.get(index) ?? 0) >= minDegree) kept.add(index)
  }
  const adjacency = new Map([...kept].map((index) => [index, []]))
  for (const [source, target] of cites) {
    if (!kept.has(source) || !kept.has(target)) continue
    adjacency.get(source).push(target)
    adjacency.get(target).push(source)
  }
  const seen = new Set()
  let best = new Set()
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue
    const component = new Set([start])
    seen.add(start)
    const queue = [start]
    while (queue.length > 0) {
      const current = queue.pop()
      for (const neighbor of adjacency.get(current)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor)
          component.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    best = component.size > best.size ? component : best
  }
  const order = [...best].sort((a, b) => a - b)
  const positionOf = new Map(order.map((index, position) => [index, position]))
  const coreCites = []
  for (const [source, target] of cites) {
    if (!positionOf.has(source) || !positionOf.has(target)) continue
    coreCites.push([positionOf.get(source), positionOf.get(target)])
  }
  coreCites.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return { works: order.map((index) => works[index]), cites: coreCites }
}

export function columnsOf(works, cites) {
  return {
    works: {
      id: works.map((work) => work.id),
      title: works.map((work) => work.title),
      year: works.map((work) => work.year),
      citations: works.map((work) => work.citations),
      author: works.map((work) => work.author),
    },
    cites: cites.flat(),
  }
}
