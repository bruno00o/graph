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
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(
      items,
      engine
        ? { color: 'group', size: 'weight', label: 'label' }
        : { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' },
    ),
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
