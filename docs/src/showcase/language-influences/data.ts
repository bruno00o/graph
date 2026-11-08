import { messages } from './messages'

export interface RawLanguage {
  readonly id: string
  readonly name: string
  readonly year: number | null
  readonly paradigms: readonly string[]
}

export interface RawInfluence {
  readonly id: string
  readonly source: string
  readonly target: string
}

export interface RawDataset {
  readonly nodes: readonly RawLanguage[]
  readonly edges: readonly RawInfluence[]
}

export interface Language extends RawLanguage {
  readonly main: string
}

export interface Influence {
  readonly id: string
  readonly from: string
  readonly to: string
}

export interface Network {
  readonly languages: readonly Language[]
  readonly influences: readonly Influence[]
  readonly categories: readonly string[]
  readonly byId: ReadonlyMap<string, Language>
  readonly influencersOf: ReadonlyMap<string, readonly Language[]>
  readonly influencedOf: ReadonlyMap<string, readonly Language[]>
  readonly untimed: number
  readonly firstYear: number
  readonly lastYear: number
}

export const coloredParadigms = 6

export const yearMs = 365.25 * 86_400_000

export function paradigmCounts(nodes: readonly RawLanguage[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    for (const paradigm of new Set(node.paradigms)) {
      counts.set(paradigm, (counts.get(paradigm) ?? 0) + 1)
    }
  }
  return counts
}

export function commonestParadigm(
  paradigms: readonly string[],
  counts: ReadonlyMap<string, number>,
): string | null {
  let best: string | null = null
  let bestCount = 0
  for (const paradigm of paradigms) {
    const count = counts.get(paradigm) ?? 0
    if (count > bestCount || (count === bestCount && best !== null && paradigm < best)) {
      best = paradigm
      bestCount = count
    }
  }
  return best
}

export function paradigmName(label: string): string {
  const short = label.replace(/ programming$/, '')
  return short.charAt(0).toUpperCase() + short.slice(1)
}

export function mainParadigms(nodes: readonly RawLanguage[]): {
  readonly main: ReadonlyMap<string, string>
  readonly categories: readonly string[]
} {
  const counts = paradigmCounts(nodes)
  const commonest = new Map<string, string | null>()
  const sizes = new Map<string, number>()
  for (const node of nodes) {
    const label = commonestParadigm(node.paradigms, counts)
    commonest.set(node.id, label)
    if (label !== null) sizes.set(label, (sizes.get(label) ?? 0) + 1)
  }
  const colored = [...sizes]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, coloredParadigms)
    .map(([label]) => label)
  const kept = new Set(colored)
  const main = new Map<string, string>()
  let others = false
  let none = false
  for (const node of nodes) {
    const label = commonest.get(node.id) ?? null
    if (label === null) {
      main.set(node.id, messages.paradigm.none)
      none = true
    } else if (kept.has(label)) {
      main.set(node.id, label)
    } else {
      main.set(node.id, messages.paradigm.other)
      others = true
    }
  }
  return {
    main,
    categories: [
      ...colored,
      ...(others ? [messages.paradigm.other] : []),
      ...(none ? [messages.paradigm.none] : []),
    ],
  }
}

function byName(a: Language, b: Language): number {
  return a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id)
}

export function prepare(data: RawDataset): Network {
  const { main, categories } = mainParadigms(data.nodes)
  const languages: Language[] = data.nodes.map((node) => ({
    ...node,
    main: main.get(node.id) ?? messages.paradigm.none,
  }))
  const byId = new Map(languages.map((language) => [language.id, language]))
  const influences: Influence[] = []
  const influencersOf = new Map<string, Language[]>()
  const influencedOf = new Map<string, Language[]>()
  const push = (map: Map<string, Language[]>, key: string, value: Language) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const edge of data.edges) {
    const influencer = byId.get(edge.target)
    const influenced = byId.get(edge.source)
    if (!influencer || !influenced) continue
    influences.push({
      id: `${influencer.id}-${influenced.id}`,
      from: influencer.id,
      to: influenced.id,
    })
    push(influencersOf, influenced.id, influencer)
    push(influencedOf, influencer.id, influenced)
  }
  for (const list of [...influencersOf.values(), ...influencedOf.values()]) list.sort(byName)
  const years = languages.flatMap((language) => (language.year === null ? [] : [language.year]))
  return {
    languages,
    influences,
    categories,
    byId,
    influencersOf,
    influencedOf,
    untimed: languages.length - years.length,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
  }
}

export function degreeOf(network: Network, id: string): number {
  return (network.influencersOf.get(id)?.length ?? 0) + (network.influencedOf.get(id)?.length ?? 0)
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function searchLanguages(network: Network, query: string, limit = 8): Language[] {
  const text = fold(query.trim())
  if (text === '') return []
  const scored: Array<{ readonly language: Language; readonly rank: number }> = []
  for (const language of network.languages) {
    const name = fold(language.name)
    let rank = -1
    if (name === text) rank = 0
    else if (name.startsWith(text)) rank = 1
    else if (name.split(/[\s-]+/).some((word) => word.startsWith(text))) rank = 2
    else if (name.includes(text)) rank = 3
    if (rank >= 0) scored.push({ language, rank })
  }
  return scored
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        degreeOf(network, b.language.id) - degreeOf(network, a.language.id) ||
        a.language.id.localeCompare(b.language.id),
    )
    .slice(0, limit)
    .map((item) => item.language)
}

export function yearTime(language: Language): number | null {
  return language.year === null ? null : new Date(language.year, 0, 1).getTime()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return (await response.json()) as T
}

let cache: Promise<Network> | null = null

export function loadNetwork(): Promise<Network> {
  if (cache) return cache
  const url = `${import.meta.env.BASE_URL}showcase-data/language-influences/languages.json`
  const loading = fetchJson<RawDataset>(url).then(prepare)
  cache = loading
  loading.catch(() => {
    cache = null
  })
  return loading
}
