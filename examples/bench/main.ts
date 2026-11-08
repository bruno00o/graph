import { defineGraph, edges, groups, mountGraph, nodes } from '@bruno00o/graph'
import { type ForceEngine, force } from '@bruno00o/graph/layouts/force'
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
const links: readonly (Link | TimedLink)[] = history?.links ?? sample.links
const winding = bends > 0 ? windingRoutes(items, links, bends) : null
const generated = performance.now()

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

const define = (nodeData: readonly (Item | TimedItem)[]) =>
  defineGraph({
    marks: [
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
