import { defineGraph, edges, groups, mountGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { type ForceEngine, force } from '@bruno00o/graph/layouts/force'
import { shapes } from '@bruno00o/graph/shapes'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'
import {
  createCommunities,
  createSample,
  type Item,
  type Link,
  spreadInTime,
  type TimedItem,
  type TimedLink,
} from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { createPage } from '../shared/page'

const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 50_000)
const edgeCount = Number(params.get('edges') ?? 100_000)
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']
const engine = engines.find((value) => value === params.get('layout'))
const levels = params.get('multilevel')
const multilevel = levels === 'off' ? false : levels === 'on' ? true : 'auto'
const flow = params.has('flow')
const decor = params.has('decor')
const screen = params.has('screen')
const timed = params.has('time')
const split = params.has('ends')
const boxed = params.has('box')
const stack = Number(params.get('stack') ?? 0)
const spread = !params.has('nospread')
const bends = Number(params.get('waypoints') ?? 0)
const merging = params.get('merge')
const twoWay = Number(params.get('twoway') ?? 0.5)
const shapeCount = Number(params.get('shapes') ?? 0)
const shapePoints = Math.max(3, Number(params.get('points') ?? 50))
const shapeParts = params.get('parts') ?? 'both'
const shapeLabels = params.has('shapelabels')
const pinCount = Number(params.get('pinned') ?? 0)
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="9" r="4" fill="black"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7z" fill="black"/></svg>')}`

const nativeFrame = window.requestAnimationFrame.bind(window)
const frameCosts: number[] = []
window.requestAnimationFrame = (callback) =>
  nativeFrame((time) => {
    const start = performance.now()
    callback(time)
    frameCosts.push(performance.now() - start)
  })

const nextFrame = () => new Promise<number>((resolve) => nativeFrame(resolve))

const started = performance.now()
const sample = engine ? createCommunities(nodeCount, edgeCount) : createSample(nodeCount, edgeCount)
const history = timed ? spreadInTime(sample) : null
const items: readonly (Item | TimedItem)[] = stacked(history?.items ?? sample.items)
const links: readonly (Link | TimedLink)[] = backwards(history?.links ?? sample.links)
const winding = bends > 0 ? windingRoutes(items, links, bends) : null
const zones = shapeCount > 0 ? scatteredZones(items, shapeCount, shapePoints) : []
const pins = Array.from({ length: Math.min(pinCount, items.length) }, (_, index) => ({
  id: `p${index}`,
  node: items[index]?.id ?? '',
  geometry: { center: { x: 0, y: 0 }, radius: 24, inner: 12 },
}))
const generated = performance.now()

function scatteredZones(
  list: readonly (Item | TimedItem)[],
  count: number,
  points: number,
): { id: string; geometry: ShapeGeometry; rank: number }[] {
  let seed = 17
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
  const reach = Math.sqrt(list.length) * 2.5
  return Array.from({ length: count }, (_, index) => {
    const center = list[Math.floor(next() * list.length)] ?? { x: 0, y: 0 }
    const radius = reach * (0.4 + next())
    const ring = Array.from({ length: points }, (_, k) => {
      const angle = ((k + 0.5 * next()) / points) * Math.PI * 2
      const distance = radius * (0.6 + 0.4 * next())
      return [center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance] as const
    })
    return { id: `z${index}`, geometry: { rings: [ring] }, rank: next() }
  })
}

function windingRoutes(
  list: readonly (Item | TimedItem)[],
  edgeList: readonly (Link | TimedLink)[],
  inner: number,
): Map<string, [number, number][]> {
  const at = new Map(list.map((item) => [item.id, item]))
  const routes = new Map<string, [number, number][]>()
  edgeList.forEach((link, index) => {
    const from = at.get(link.from)
    const to = at.get(link.to)
    if (!from || !to) return
    const dx = to.x - from.x
    const dy = to.y - from.y
    const waves = 1 + (index % 3)
    const points: [number, number][] = []
    for (let k = 1; k <= inner; k++) {
      const u = k / (inner + 1)
      const lift = Math.sin(u * Math.PI * waves) * 0.12
      points.push([from.x + dx * u - dy * lift, from.y + dy * u + dx * lift])
    }
    routes.set(link.id, points)
  })
  return routes
}
function backwards(list: readonly (Link | TimedLink)[]): readonly (Link | TimedLink)[] {
  if (!merging) return list
  const every = Math.max(1, Math.round(1 / twoWay))
  const reversed = list
    .filter((_, index) => index % every === 0)
    .map((link) => ({ ...link, id: `${link.id}~`, from: link.to, to: link.from }))
  return [...list, ...reversed]
}

const spanOf = (element: Item | TimedItem | Link | TimedLink) =>
  'start' in element ? { start: element.start, end: element.end } : null

function stacked(list: readonly (Item | TimedItem)[]): readonly (Item | TimedItem)[] {
  if (!(stack > 0)) return list
  return list.map((item, index) => {
    if (index >= stack) return item
    const first = list[index - (index % 4)] ?? item
    return { ...item, x: first.x, y: first.y }
  })
}

const define = (nodeData: readonly (Item | TimedItem)[], zoneData: typeof zones = zones) =>
  defineGraph({
    marks: [
      ...(zoneData.length > 0
        ? [
            shapes(zoneData, {
              fill: (zone) =>
                shapeParts === 'stroke'
                  ? null
                  : `var(--graph-cat-${1 + Math.floor(zone.rank * 8)})`,
              ...(shapeParts === 'fill' ? { stroke: null } : {}),
              ...(shapeParts === 'none' ? { fill: null, strokeWidth: 0 } : {}),
              opacity: 0.25,
              order: 'rank',
              ...(shapeLabels ? { label: (zone: (typeof zones)[number]) => zone.id } : {}),
            }),
          ]
        : []),
      ...(pins.length > 0
        ? [shapes(pins, { node: 'node', fill: 'var(--graph-cat-5)', stroke: null, opacity: 0.4 })]
        : []),
      edges<Link | TimedLink>(links, {
        source: 'from',
        target: 'to',
        arrow: 'target',
        flow,
        ...(winding ? { waypoints: (link) => winding.get(link.id) } : {}),
        ...(timed ? { time: spanOf } : {}),
        ...(decor ? { dash: (link) => (link.strength > 0.6 ? 'dashed' : 'solid') } : {}),
        ...(split
          ? {
              ends: {
                split: (link) => link.strength,
                source: { stroke: 'var(--graph-cat-3)' },
                target: { stroke: 'var(--graph-cat-4)' },
              },
            }
          : {}),
        ...(merging
          ? {
              merge: { directed: false, min: 1, halves: merging === 'halves' },
              aggregate: {
                ends: {
                  source: {
                    stroke: (aggregate) =>
                      aggregate.backward.count > 0 ? 'var(--graph-cat-3)' : 'var(--graph-cat-4)',
                  },
                  target: { stroke: 'var(--graph-cat-4)' },
                },
              },
            }
          : {}),
      }),
      nodes<Item | TimedItem>(nodeData, {
        ...(engine ? {} : { x: 'x', y: 'y' }),
        ...(timed ? { time: spanOf } : {}),
        ...(screen ? { units: 'screen' as const } : {}),
        color: 'group',
        size: 'weight',
        label: 'label',
        ...(boxed ? { shape: 'box' as const } : {}),
        ...(decor
          ? {
              outline: (item) => (item.weight > 20 ? 'var(--graph-accent)' : null),
              image: (item) =>
                item.weight % 3 === 0 ? { src: icon, scale: 0.7, color: 'white' } : null,
              badges: { topRight: (item) => (item.weight > 50 ? { text: item.weight } : null) },
            }
          : {}),
      }),
      ...(stack > 0
        ? [
            groups(nodeData.slice(0, stack), {
              by: 'group',
              folded: false,
              container: { spread },
            }),
          ]
        : []),
    ],
    states: {
      muted: { opacity: 0.06, label: false },
      near: { others: { opacity: 0.06, label: false } },
    },
    layout: engine ? force({ engine, multilevel }) : null,
  })
const definition = define(items)

const { main } = createPage(messages.bench(formatNumber(items.length), formatNumber(links.length)))
const graph = mountGraph(main, {
  definition,
  ...(history
    ? { initialTime: { start: history.start, end: history.start + 90 * 86_400_000 } }
    : {}),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})
const mounted = performance.now()
const layoutRuns: { readonly ms: number; readonly completed: boolean }[] = []
let layoutStarted = mounted
graph.on('layoutstart', () => {
  if (layoutRuns.length > 0) layoutStarted = performance.now()
})
graph.on('layoutend', ({ completed }) => {
  layoutRuns.push({ ms: performance.now() - layoutStarted, completed })
})
await nextFrame()
await nextFrame()
const firstFrame = performance.now()
const timeline = history ? createTimeline(graph) : null
const timelineReady = performance.now()
if (timeline) {
  const view = mountTimeline(timeline, {
    ariaLabel: messages.timeLabel,
    labels: { ...messages.timeLabels, range: messages.timeRange },
  })
  view.element.classList.add('timeline')
  main.append(view.element)
}

Object.assign(window, {
  bench: {
    graph,
    items,
    links,
    zones,
    frameCosts,
    nextFrame,
    layoutRuns,
    history,
    timeline,
    define,
    timings: {
      timeline: timelineReady - firstFrame,
      generate: generated - started,
      mount: mounted - generated,
      firstFrame: firstFrame - mounted,
    },
  },
})
