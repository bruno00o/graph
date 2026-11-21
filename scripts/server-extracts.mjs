import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { exportSvg } from '@bruno00o/graph/export'
import { createGraph, readFont } from '@bruno00o/graph/headless'
import { force } from '@bruno00o/graph/layouts/force'
import { Resvg } from '@resvg/resvg-js'

const fontPath = createRequire(import.meta.url).resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf')

function sample(seed, count) {
  let state = seed
  const random = () => {
    state = (state * 1103515245 + 12345) >>> 0
    return state / 2 ** 32
  }
  const items = Array.from({ length: count }, (_, at) => ({
    id: `n${at}`,
    label: `Item ${at}`,
    group: ['north', 'south', 'east', 'west'][at % 4],
    weight: 1 + Math.floor(random() * 9),
  }))
  const links = []
  for (let at = 1; at < count; at++) {
    links.push({ id: `t${at}`, from: `n${Math.floor(random() * at)}`, to: `n${at}` })
    if (random() < 0.6) {
      links.push({ id: `x${at}`, from: `n${at}`, to: `n${Math.floor(random() * count)}` })
    }
  }
  return { items, links }
}

async function extract(font, seed, count) {
  const { items, links } = sample(seed, count)
  const graph = createGraph({
    definition: defineGraph({
      marks: [
        nodes(items, {
          label: (item) => item.label,
          color: (item) => item.group,
          size: (item) => item.weight,
        }),
        edges(links, { source: (link) => link.from, target: (link) => link.to, arrow: 'target' }),
      ],
      layout: force(),
    }),
    theme: { font: font.family },
    measureText: font.width,
  })
  await graph.settled()
  const svg = await exportSvg(graph, { region: 'graph', size: { width: 1600 } })
  graph.destroy()
  const png = new Resvg(svg, {
    font: { loadSystemFonts: false, fontFiles: [fontPath], defaultFontFamily: font.family },
  })
    .render()
    .asPng()
  return { svg, png }
}

async function work({ seeds, count, out }) {
  const font = readFont(readFileSync(fontPath))
  for (const seed of seeds) {
    const { svg, png } = await extract(font, seed, count)
    writeFileSync(join(out, `graph-${seed}.svg`), svg)
    writeFileSync(join(out, `graph-${seed}.png`), png)
  }
}

if (isMainThread) {
  const { values } = parseArgs({
    options: {
      graphs: { type: 'string', default: '24' },
      nodes: { type: 'string', default: '200' },
      threads: { type: 'string', default: String(Math.min(4, availableParallelism())) },
      out: { type: 'string' },
    },
  })
  const graphs = Number(values.graphs)
  const count = Number(values.nodes)
  const threads = Math.max(1, Math.min(Number(values.threads), graphs))
  const out = values.out ?? mkdtempSync(join(tmpdir(), 'graph-extracts-'))
  mkdirSync(out, { recursive: true })
  const shares = Array.from({ length: threads }, () => [])
  for (let seed = 1; seed <= graphs; seed++) shares[seed % threads].push(seed)
  const start = performance.now()
  await Promise.all(
    shares.map(
      (seeds) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { seeds, count, out },
          })
          worker.once('message', resolve)
          worker.once('error', reject)
        }),
    ),
  )
  const seconds = (performance.now() - start) / 1000
  const rate = (graphs / seconds).toFixed(1)
  console.log(`${graphs} graphs of ${count} nodes on ${threads} threads in ${seconds.toFixed(2)} s`)
  console.log(`${rate} graphs per second, written to ${out}`)
} else {
  await work(workerData)
  parentPort.postMessage('done')
}
