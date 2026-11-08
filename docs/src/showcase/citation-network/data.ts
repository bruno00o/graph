export interface RawTopic {
  readonly id: string
  readonly name: string
}

export interface RawColumns {
  readonly id: readonly string[]
  readonly title: readonly string[]
  readonly year: ReadonlyArray<number | null>
  readonly citations: readonly number[]
  readonly author: ReadonlyArray<string | null>
  readonly x?: ReadonlyArray<number | null> | undefined
  readonly y?: ReadonlyArray<number | null> | undefined
}

export interface RawLayout {
  readonly name: string
  readonly options?: { readonly edgeLength?: number } | undefined
  readonly library?: string | undefined
}

export interface RawDataset {
  readonly retrieved: string
  readonly topic: RawTopic
  readonly works: RawColumns
  readonly cites: readonly number[]
  readonly layout?: RawLayout | undefined
}

export interface Work {
  readonly id: string
  readonly title: string
  readonly year: number | null
  readonly citations: number
  readonly author: string | null
  readonly x: number | null
  readonly y: number | null
  readonly incoming: number
  readonly outgoing: number
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface Network {
  readonly retrieved: string
  readonly topic: RawTopic
  readonly works: readonly Work[]
  readonly links: readonly Link[]
  readonly byId: ReadonlyMap<string, Work>
  readonly citingOf: ReadonlyMap<string, readonly Work[]>
  readonly citedByOf: ReadonlyMap<string, readonly Work[]>
  readonly untimed: number
  readonly firstYear: number
  readonly lastYear: number
  readonly maxIncoming: number
}

export const yearMs = 365.25 * 86_400_000

export function byIncoming(a: Work, b: Work): number {
  return b.incoming - a.incoming || b.citations - a.citations || a.id.localeCompare(b.id)
}

export function prepare(data: RawDataset): Network {
  const { id, title, year, citations, author } = data.works
  const total = id.length
  const incoming = new Int32Array(total)
  const outgoing = new Int32Array(total)
  const links: Link[] = []
  for (let at = 0; at + 1 < data.cites.length; at += 2) {
    const citing = data.cites[at] ?? -1
    const cited = data.cites[at + 1] ?? -1
    if (citing < 0 || citing >= total || cited < 0 || cited >= total || citing === cited) continue
    links.push({
      id: `l${links.length}`,
      from: id[citing] ?? '',
      to: id[cited] ?? '',
    })
    incoming[cited] = (incoming[cited] ?? 0) + 1
    outgoing[citing] = (outgoing[citing] ?? 0) + 1
  }
  const works: Work[] = []
  for (let at = 0; at < total; at++) {
    works.push({
      id: id[at] ?? '',
      title: title[at] ?? id[at] ?? '',
      year: year[at] ?? null,
      citations: citations[at] ?? 0,
      author: author[at] ?? null,
      x: positionOf(data.works.x, at),
      y: positionOf(data.works.y, at),
      incoming: incoming[at] ?? 0,
      outgoing: outgoing[at] ?? 0,
    })
  }
  const byId = new Map(works.map((work) => [work.id, work]))
  const citingOf = new Map<string, Work[]>()
  const citedByOf = new Map<string, Work[]>()
  for (const link of links) {
    const citing = byId.get(link.from)
    const cited = byId.get(link.to)
    if (!citing || !cited) continue
    const forward = citingOf.get(link.from)
    if (forward) forward.push(cited)
    else citingOf.set(link.from, [cited])
    const backward = citedByOf.get(link.to)
    if (backward) backward.push(citing)
    else citedByOf.set(link.to, [citing])
  }
  const years: number[] = []
  let untimed = 0
  for (const work of works) {
    if (work.year === null) untimed += 1
    else years.push(work.year)
  }
  years.sort((a, b) => a - b)
  const percentile = (share: number): number => {
    if (years.length === 0) return 1900
    const at = Math.min(years.length - 1, Math.max(0, Math.round(share * (years.length - 1))))
    return years[at] ?? 1900
  }
  return {
    retrieved: data.retrieved,
    topic: data.topic,
    works,
    links,
    byId,
    citingOf,
    citedByOf,
    untimed,
    firstYear: percentile(0.05),
    lastYear: percentile(0.95),
    maxIncoming: works.reduce((max, work) => Math.max(max, work.incoming), 0),
  }
}

function positionOf(column: ReadonlyArray<number | null> | undefined, at: number): number | null {
  const value = column?.[at] ?? null
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function searchWorks(network: Network, query: string, limit = 8): Work[] {
  const text = fold(query.trim())
  if (text === '') return []
  const scored: Array<{ readonly work: Work; readonly rank: number }> = []
  for (const work of network.works) {
    const title = fold(work.title)
    const name = fold(work.author ?? '')
    let rank = -1
    if (title === text) rank = 0
    else if (title.startsWith(text)) rank = 1
    else if (title.split(/[\s:,-]+/).some((word) => word.startsWith(text))) rank = 2
    else if (title.includes(text)) rank = 3
    else if (name.startsWith(text)) rank = 4
    else if (name.split(/[\s-]+/).some((word) => word.startsWith(text))) rank = 5
    else if (name.includes(text)) rank = 6
    if (rank >= 0) scored.push({ work, rank })
  }
  return scored
    .sort((a, b) => a.rank - b.rank || byIncoming(a.work, b.work))
    .slice(0, limit)
    .map((item) => item.work)
}

export function topWorks(works: readonly Work[], limit = 10): Work[] {
  return [...works].sort(byIncoming).slice(0, limit)
}

export function yearTime(work: Work): number | null {
  return work.year === null ? null : new Date(work.year, 0, 1).getTime()
}

async function fetchJson(url: string): Promise<RawDataset> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  const data: RawDataset = await response.json()
  return data
}

let cache: Promise<Network> | null = null

export function loadNetwork(): Promise<Network> {
  if (cache) return cache
  const url = `${import.meta.env.BASE_URL}showcase-data/citation-network/works.json`
  const loading = fetchJson(url).then(prepare)
  cache = loading
  loading.catch(() => {
    cache = null
  })
  return loading
}
