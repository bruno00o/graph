import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { createPage } from '../shared/page'

const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 50_000)
const edgeCount = Number(params.get('edges') ?? 100_000)

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
const { items, links } = createSample(nodeCount, edgeCount)
const generated = performance.now()

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { muted: { opacity: 0.06, label: false } },
})

const { main } = createPage(messages.bench(formatNumber(items.length), formatNumber(links.length)))
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})
const mounted = performance.now()
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
    timings: {
      generate: generated - started,
      mount: mounted - generated,
      firstFrame: firstFrame - mounted,
    },
  },
})
