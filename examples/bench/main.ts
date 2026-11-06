import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { type ForceEngine, force } from '@bruno00o/graph/layouts/force'
import { createCommunities, createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { createPage } from '../shared/page'

const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 50_000)
const edgeCount = Number(params.get('edges') ?? 100_000)
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']
const engine = engines.find((value) => value === params.get('layout'))
const flow = params.has('flow')
const decor = params.has('decor')
const screen = params.has('screen')
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
const { items, links } = engine
  ? createCommunities(nodeCount, edgeCount)
  : createSample(nodeCount, edgeCount)
const generated = performance.now()

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      arrow: 'target',
      flow,
      ...(decor ? { dash: (link) => (link.strength > 0.6 ? 'dashed' : 'solid') } : {}),
    }),
    nodes<Item>(items, {
      ...(engine ? {} : { x: 'x', y: 'y' }),
      ...(screen ? { units: 'screen' as const } : {}),
      color: 'group',
      size: 'weight',
      label: 'label',
      ...(decor
        ? {
            outline: (item) => (item.weight > 20 ? 'var(--graph-accent)' : null),
            image: (item) =>
              item.weight % 3 === 0 ? { src: icon, scale: 0.7, color: 'white' } : null,
            badges: { topRight: (item) => (item.weight > 50 ? { text: item.weight } : null) },
          }
        : {}),
    }),
  ],
  states: { muted: { opacity: 0.06, label: false } },
  layout: engine ? force({ engine }) : null,
})

const { main } = createPage(messages.bench(formatNumber(items.length), formatNumber(links.length)))
const graph = mountGraph(main, {
  definition,
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

Object.assign(window, {
  bench: {
    graph,
    items,
    links,
    frameCosts,
    nextFrame,
    layoutRuns,
    timings: {
      generate: generated - started,
      mount: mounted - generated,
      firstFrame: firstFrame - mounted,
    },
  },
})
