import { formatNumber, messages } from './messages'

export interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly x: number
  readonly y: number
  readonly parent?: string | null
}

export interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly strength: number
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Sample {
  readonly items: Item[]
  readonly links: Link[]
}

export interface Communities extends Sample {
  readonly community: Uint32Array
  readonly sizes: readonly number[]
  readonly parent: readonly number[]
}

export function createSample(
  nodeCount: number,
  edgeCount: number,
  groups = 8,
  seed = 7,
  mixing = 0.08,
): Sample {
  const next = random(seed)
  const gaussian = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next())
  const spread = Math.sqrt(nodeCount) * 9
  const centers = Array.from({ length: groups }, (_, index) => {
    const angle = (index / groups) * Math.PI * 2
    return { x: Math.cos(angle) * spread * 1.6, y: Math.sin(angle) * spread * 1.6 }
  })
  const members: number[][] = centers.map(() => [])
  const groupOf: number[] = []
  const items: Item[] = Array.from({ length: nodeCount }, (_, index) => {
    const group = Math.floor(next() * groups)
    members[group]?.push(index)
    groupOf.push(group)
    const center = centers[group] ?? { x: 0, y: 0 }
    return {
      id: `n${index}`,
      label: messages.node(formatNumber(index + 1)),
      group: messages.group(String.fromCharCode(65 + group)),
      weight: Math.round(1 + next() ** 3 * 99),
      x: center.x + gaussian() * spread * 0.45,
      y: center.y + gaussian() * spread * 0.45,
    }
  })
  const links: Link[] = []
  for (let index = 0; index < edgeCount; index++) {
    const source = Math.floor(next() * nodeCount)
    const pool = next() >= mixing ? members[groupOf[source] ?? 0] : undefined
    const target =
      pool && pool.length > 0
        ? (pool[Math.floor(next() * pool.length)] ?? 0)
        : Math.floor(next() * nodeCount)
    if (target === source) continue
    links.push({ id: `e${index}`, from: `n${source}`, to: `n${target}`, strength: next() })
  }
  return { items, links }
}

export function createCommunities(nodeCount: number, edgeCount: number, seed = 11): Communities {
  const next = random(seed)
  const sizes: number[] = []
  let total = 0
  while (total < nodeCount) {
    const size = Math.round(12 / (next() || 1e-9) ** 0.75)
    sizes.push(Math.min(nodeCount - total, Math.max(4, size)))
    total += sizes.at(-1) ?? 0
  }
  const degree = new Uint32Array(nodeCount)
  const links: Link[] = []
  const link = (from: number, to: number) => {
    if (from === to) return
    links.push({ id: `e${links.length}`, from: `n${from}`, to: `n${to}`, strength: next() })
    degree[from] = (degree[from] ?? 0) + 1
    degree[to] = (degree[to] ?? 0) + 1
  }
  const inside = (edgeCount * 0.92) / nodeCount
  const starts: number[] = []
  const groupOf = new Uint32Array(nodeCount)
  let first = 0
  sizes.forEach((size, community) => {
    const ends: number[] = []
    for (let offset = 0; offset < size; offset++) {
      const node = first + offset
      groupOf[node] = community
      if (offset === 0) continue
      const count = Math.floor(inside) + (next() < inside % 1 ? 1 : 0)
      for (let k = 0; k < Math.max(1, count); k++) {
        const target =
          ends.length > 0 && next() < 0.8
            ? (ends[Math.floor(next() * ends.length)] ?? first)
            : first + Math.floor(next() * offset)
        link(node, target)
        ends.push(node, target)
      }
    }
    starts.push(first)
    first += size
  })
  const parent = sizes.map((_, community) => Math.floor(next() * community))
  const member = (community: number) =>
    (starts[community] ?? 0) + Math.floor(next() ** 3 * (sizes[community] ?? 1))
  for (let community = 1; community < sizes.length; community++) {
    link(starts[community] ?? 0, member(parent[community] ?? 0))
  }
  while (links.length < edgeCount && sizes.length > 1) {
    const community = 1 + Math.floor(next() * (sizes.length - 1))
    link(member(community), member(parent[community] ?? 0))
  }
  const items: Item[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: messages.node(formatNumber(index + 1)),
    group: messages.group(String.fromCharCode(65 + ((groupOf[index] ?? 0) % 12))),
    weight: Math.min(100, 1 + (degree[index] ?? 0)),
    x: 0,
    y: 0,
  }))
  return { items, links, community: groupOf, sizes, parent }
}

export function nestCommunities(sample: Communities, smallest: number, depth: number): Item[] {
  const { sizes, parent, community } = sample
  const level = new Int32Array(sizes.length).fill(-1)
  const holder = new Int32Array(sizes.length).fill(-1)
  const groups: Item[] = []
  sizes.forEach((size, at) => {
    if (size < smallest) return
    let up = at > 0 ? (parent[at] ?? 0) : -1
    while (up >= 0 && level[up] === -1) up = up > 0 ? (parent[up] ?? 0) : -1
    if (up >= 0 && (level[up] ?? 0) + 1 >= depth) up = holder[up] ?? -1
    level[at] = up >= 0 ? (level[up] ?? 0) + 1 : 0
    holder[at] = up
    groups.push({
      id: `c${at}`,
      label: messages.group(formatNumber(at + 1)),
      group: messages.group(String.fromCharCode(65 + (at % 12))),
      weight: 1,
      x: 0,
      y: 0,
      parent: up >= 0 ? `c${up}` : null,
    })
  })
  const members = sample.items.map((item, index) => {
    const at = community[index] ?? 0
    return level[at] === -1 ? item : { ...item, parent: `c${at}` }
  })
  return [...groups, ...members]
}

export interface Hierarchy extends Sample {
  readonly level: Uint32Array
  readonly place: Float64Array
}

export function createHierarchy(nodeCount: number, edgeCount: number, seed = 5): Hierarchy {
  const next = random(seed)
  const depth = Math.max(2, Math.round(Math.log2(Math.max(nodeCount, 2)) * 1.3))
  const roots = Math.max(1, Math.min(nodeCount, Math.round(nodeCount / 50)))
  const weights = Array.from({ length: depth - 1 }, (_, level) =>
    Math.sin(((level + 0.7) / depth) * Math.PI),
  )
  const sum = weights.reduce((total, weight) => total + weight, 0)
  const levels: number[][] = [Array.from({ length: roots }, (_, index) => index)]
  let made = roots
  weights.forEach((weight, at) => {
    const last = at === weights.length - 1
    const size = last ? nodeCount - made : Math.round(((nodeCount - roots) * weight) / sum)
    const level = Array.from(
      { length: Math.max(0, Math.min(size, nodeCount - made)) },
      (_, k) => made + k,
    )
    made += level.length
    if (level.length > 0) levels.push(level)
  })
  const groupOf = new Uint32Array(nodeCount)
  const degree = new Uint32Array(nodeCount)
  const level = new Uint32Array(nodeCount)
  const place = new Float64Array(nodeCount)
  levels.forEach((nodes, depthAt) => {
    nodes.forEach((node, at) => {
      level[node] = depthAt
      place[node] = (at + 0.5) / nodes.length
    })
  })
  const seen = new Set<string>()
  const links: Link[] = []
  const link = (from: number, to: number) => {
    const key = `${from}>${to}`
    if (seen.has(key)) return false
    seen.add(key)
    links.push({ id: `e${links.length}`, from: `n${from}`, to: `n${to}`, strength: next() })
    degree[from] = (degree[from] ?? 0) + 1
    degree[to] = (degree[to] ?? 0) + 1
    return true
  }
  const near = (level: readonly number[], ratio: number, spread: number) => {
    const at = Math.round(ratio * (level.length - 1) + (next() - 0.5) * spread * level.length)
    return level[Math.min(level.length - 1, Math.max(0, at))] ?? 0
  }
  levels[0]?.forEach((node, at) => {
    groupOf[node] = at
  })
  for (let depthAt = 1; depthAt < levels.length; depthAt++) {
    const level = levels[depthAt] ?? []
    const above = levels[depthAt - 1] ?? []
    level.forEach((node, at) => {
      const parent = near(above, (at + 0.5) / level.length, 0.1)
      groupOf[node] = depthAt === 1 ? at : (groupOf[parent] ?? 0)
      link(parent, node)
    })
  }
  for (let attempt = 0; links.length < edgeCount && attempt < edgeCount * 20; attempt++) {
    const depthAt = 1 + Math.floor(next() * (levels.length - 1))
    const level = levels[depthAt] ?? []
    const node = level[Math.floor(next() * level.length)] ?? 0
    const jump = depthAt > 1 && next() < 0.3 ? 2 : 1
    const above = levels[depthAt - jump] ?? []
    link(near(above, level.indexOf(node) / Math.max(1, level.length - 1), 0.15), node)
  }
  const items: Item[] = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: messages.node(formatNumber(index + 1)),
    group: messages.group(String.fromCharCode(65 + ((groupOf[index] ?? 0) % 12))),
    weight: Math.min(100, 1 + (degree[index] ?? 0)),
    x: 0,
    y: 0,
  }))
  return { items, links, level, place }
}

export function nestHierarchy(sample: Hierarchy, seed = 3): Item[] {
  const next = random(seed)
  const tops = Math.max(2, Math.round(sample.items.length / 700))
  const groups: Item[] = []
  const letterOf = (top: number) => String.fromCharCode(65 + (top % 26))
  const container = (id: string, label: string, top: number, parent: string | null): Item => ({
    id,
    label,
    group: messages.group(letterOf(top)),
    weight: 1,
    x: 0,
    y: 0,
    parent,
  })
  for (let top = 0; top < tops; top++) {
    const letter = letterOf(top)
    groups.push(container(`h${top}`, messages.group(letter), top, null))
    for (let half = 0; half < 2; half++) {
      const name = `${letter}${half + 1}`
      groups.push(container(`h${top}-${half}`, messages.subgroup(name), top, `h${top}`))
      for (let quarter = 0; quarter < 2; quarter++) {
        const inner = `${name}.${quarter + 1}`
        groups.push(
          container(`h${top}-${half}-${quarter}`, messages.subgroup(inner), top, `h${top}-${half}`),
        )
      }
    }
  }
  const members = sample.items.map((item, index): Item => {
    if ((sample.level[index] ?? 0) === 0) return item
    const spot = (sample.place[index] ?? 0) * tops
    const top = Math.min(tops - 1, Math.floor(spot))
    const quarter = Math.min(3, Math.floor((spot - top) * 4))
    const half = quarter >> 1
    const roll = next()
    const parent =
      roll < 0.15 ? `h${top}` : roll < 0.35 ? `h${top}-${half}` : `h${top}-${half}-${quarter & 1}`
    return { ...item, group: messages.group(letterOf(top)), parent }
  })
  return [...groups, ...members]
}

export const tierWeights = { hub: 90, branch: 40, leaf: 10 } as const

export function createTiers(hubs = 6, branches = 8, leaves = 10, seed = 9): Sample {
  const next = random(seed)
  const items: Item[] = []
  const links: Link[] = []
  const place = (x: number, y: number, radius: number, angle: number) => ({
    x: x + Math.cos(angle) * radius,
    y: y + Math.sin(angle) * radius,
  })
  for (let hub = 0; hub < hubs; hub++) {
    const group = String.fromCharCode(65 + hub)
    const angle = (hub / hubs) * Math.PI * 2
    const center = place(0, 0, 720, angle)
    const hubId = `h${hub}`
    items.push({
      id: hubId,
      label: messages.group(group),
      group: messages.group(group),
      weight: tierWeights.hub,
      ...center,
    })
    links.push({ id: `r${hub}`, from: hubId, to: `h${(hub + 1) % hubs}`, strength: 1 })
    for (let branch = 0; branch < branches; branch++) {
      const turn = angle + ((branch + 0.5) / branches) * Math.PI * 2 + (next() - 0.5) * 0.3
      const middle = place(center.x, center.y, 230 + next() * 30, turn)
      const branchId = `${hubId}-${branch}`
      items.push({
        id: branchId,
        label: messages.node(formatNumber(items.length + 1)),
        group: messages.group(group),
        weight: tierWeights.branch,
        ...middle,
      })
      links.push({ id: `t${branchId}`, from: hubId, to: branchId, strength: 1 })
      for (let leaf = 0; leaf < leaves; leaf++) {
        const spot = place(middle.x, middle.y, 50 + next() * 22, (leaf / leaves) * Math.PI * 2)
        const leafId = `${branchId}-${leaf}`
        items.push({
          id: leafId,
          label: messages.node(formatNumber(items.length + 1)),
          group: messages.group(group),
          weight: tierWeights.leaf,
          ...spot,
        })
        links.push({ id: `t${leafId}`, from: branchId, to: leafId, strength: 1 })
      }
    }
  }
  return { items, links }
}

export interface TimedItem extends Item {
  readonly start: number
  readonly end: number | null
}

export interface TimedLink extends Link {
  readonly start: number
  readonly end: number | null
}

export interface History {
  readonly items: TimedItem[]
  readonly links: TimedLink[]
  readonly start: number
  readonly end: number
}

const day = 86_400_000

export function spreadInTime(sample: Sample, years = 3, seed = 13): History {
  const next = random(seed)
  const start = Date.UTC(2021, 0, 1)
  const end = Date.UTC(2021 + years, 0, 1)
  const span = end - start
  const spans = new Map<string, readonly [number, number]>()
  const items = sample.items.map((item) => {
    const from = start + Math.floor(next() * span)
    const to = from + Math.floor((0.05 + next() * 0.4) * span)
    spans.set(item.id, [from, to])
    return { ...item, start: from, end: to < end ? to : null }
  })
  const links = sample.links.map((link) => {
    const a = spans.get(link.from) ?? [start, end]
    const b = spans.get(link.to) ?? [start, end]
    const from = Math.max(a[0], b[0]) + Math.floor(next() * 30) * day
    const to = Math.max(from, Math.min(a[1], b[1]) - Math.floor(next() * 30) * day)
    return { ...link, start: from, end: to < end ? to : null }
  })
  return { items, links, start, end }
}

export function createHistory(nodeCount: number, edgeCount: number, years = 4, seed = 17): History {
  const next = random(seed)
  const start = Date.UTC(2021, 0, 1)
  const end = Date.UTC(2021 + years, 0, 1)
  const span = end - start
  const groups = 6
  const items: TimedItem[] = []
  for (let index = 0; index < nodeCount; index++) {
    const group = Math.floor(next() * groups)
    const early = index < nodeCount / 20
    const from = start + Math.floor((early ? next() * 0.02 : Math.sqrt(next()) * 0.92) * span)
    const life = next() < 0.35 ? null : Math.floor((0.15 + next() * 0.9) * span * 0.5)
    const to = life === null ? null : from + life
    items.push({
      id: `n${index}`,
      label: messages.node(formatNumber(index + 1)),
      group: messages.group(String.fromCharCode(65 + group)),
      weight: Math.round(4 + next() ** 2 * 36),
      x: 0,
      y: 0,
      start: Math.floor(from / day) * day,
      end: to === null || to >= end ? null : Math.floor(to / day) * day,
    })
  }
  const members = new Map<string, TimedItem[]>()
  for (const item of items) {
    const list = members.get(item.group)
    if (list) list.push(item)
    else members.set(item.group, [item])
  }
  const links: TimedLink[] = []
  for (let tries = 0; links.length < edgeCount && tries < edgeCount * 20; tries++) {
    const a = items[Math.floor(next() * nodeCount)]
    const pool = (next() < 0.85 && a ? members.get(a.group) : undefined) ?? items
    const b = pool[Math.floor(next() * pool.length)]
    if (!a || !b || a === b) continue
    const from = Math.max(a.start, b.start)
    const to = Math.min(a.end ?? end, b.end ?? end)
    if (to - from < 30 * day) continue
    const linkFrom = from + Math.floor(next() * 0.3 * (to - from))
    const linkTo = next() < 0.5 ? to : linkFrom + Math.floor((0.3 + next() * 0.7) * (to - linkFrom))
    links.push({
      id: `e${links.length}`,
      from: a.id,
      to: b.id,
      strength: next(),
      start: Math.floor(linkFrom / day) * day,
      end: linkTo >= end || (linkTo === to && a.end === null && b.end === null) ? null : linkTo,
    })
  }
  return { items, links, start, end }
}

export interface LayeredLink {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly over: readonly string[]
}

export interface Strata {
  readonly places: Item[]
  readonly lower: LayeredLink[]
  readonly middle: LayeredLink[]
  readonly upper: LayeredLink[]
}

export function createStrata(columns: number, rows: number, seed = 23): Strata {
  const next = random(seed)
  const spacing = 80
  const count = columns * rows
  const places: Item[] = Array.from({ length: count }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      id: `p${index}`,
      label: messages.node(formatNumber(index + 1)),
      group: messages.group(String.fromCharCode(65 + (((column >> 3) + (row >> 3)) % 8))),
      weight: 1,
      x: (column - (columns - 1) / 2) * spacing + (next() - 0.5) * spacing * 0.3,
      y: (row - (rows - 1) / 2) * spacing + (next() - 0.5) * spacing * 0.3,
    }
  })
  const pairKey = (a: number, b: number) => (a < b ? a * count + b : b * count + a)
  const segments = new Map<number, string>()
  const lower: LayeredLink[] = []
  const addSegment = (a: number, b: number) => {
    const id = `s${lower.length}`
    lower.push({ id, from: `p${a}`, to: `p${b}`, over: [] })
    if (!segments.has(pairKey(a, b))) segments.set(pairKey(a, b), id)
  }
  for (let index = 0; index < count; index++) {
    const column = index % columns
    if (column + 1 < columns) addSegment(index, index + 1)
    if (index + columns < count) addSegment(index, index + columns)
    if (next() < 0.03 && column + 1 < columns) addSegment(index + 1, index)
  }
  const neighbors = (index: number): number[] => {
    const column = index % columns
    const around: number[] = []
    if (column > 0) around.push(index - 1)
    if (column + 1 < columns) around.push(index + 1)
    if (index >= columns) around.push(index - columns)
    if (index + columns < count) around.push(index + columns)
    return around
  }
  const middle: LayeredLink[] = []
  const middleEnds: [number, number][] = []
  const ends = new Map<number, number[]>()
  for (let attempt = 0; attempt < count * 0.8; attempt++) {
    const start = Math.floor(next() * count)
    const steps = 1 + Math.floor(next() * 4)
    const visited = new Set([start])
    const over: string[] = []
    let at = start
    for (let step = 0; step < steps; step++) {
      const options = neighbors(at).filter((place) => !visited.has(place))
      const to = options[Math.floor(next() * options.length)]
      if (to === undefined) break
      over.push(segments.get(pairKey(at, to)) ?? '')
      visited.add(to)
      at = to
    }
    if (at === start) continue
    const order = middle.length
    middle.push({ id: `m${order}`, from: `p${start}`, to: `p${at}`, over })
    middleEnds.push([start, at])
    for (const end of [start, at]) {
      const list = ends.get(end) ?? []
      list.push(order)
      ends.set(end, list)
    }
  }
  const upper: LayeredLink[] = []
  for (let attempt = 0; attempt < count * 0.3 && middle.length > 0; attempt++) {
    const first = Math.floor(next() * middle.length)
    const [start = 0, firstEnd = 0] = middleEnds[first] ?? []
    const over = [`m${first}`]
    const used = new Set([first])
    let at = firstEnd
    const hops = 1 + Math.floor(next() * 2)
    for (let hop = 0; hop < hops; hop++) {
      const options = (ends.get(at) ?? []).filter((order) => !used.has(order))
      const chosen = options[Math.floor(next() * options.length)]
      if (chosen === undefined) break
      const [a = 0, b = 0] = middleEnds[chosen] ?? []
      used.add(chosen)
      over.push(`m${chosen}`)
      at = a === at ? b : a
    }
    if (over.length < 2 || at === start) continue
    upper.push({ id: `u${upper.length}`, from: `p${start}`, to: `p${at}`, over })
  }
  return { places, lower, middle, upper }
}
