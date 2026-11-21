import type { Key, Point } from '@bruno00o/graph'
import { exportSvg } from '@bruno00o/graph/export'
import { createGraph } from '@bruno00o/graph/headless'
import { force } from '@bruno00o/graph/layouts/force'
import { definitionOf } from './definition'

export interface LayoutRequest {
  readonly seed: number
  readonly theme: 'light' | 'dark'
}

export interface Answer {
  readonly seed: number
  readonly positions: [Key, Point][]
  readonly svg: string
  readonly duration: number
}

self.addEventListener('message', async ({ data }: MessageEvent<LayoutRequest>) => {
  const started = performance.now()
  const graph = createGraph({
    definition: definitionOf(data.seed, force()),
    theme: data.theme,
    size: { width: 640, height: 600 },
  })
  await graph.settled()
  const positions = [...graph.positions.snapshot()]
  const svg = await exportSvg(graph, { region: 'graph', size: { width: 640 } })
  graph.destroy()
  const answer: Answer = {
    seed: data.seed,
    positions,
    svg,
    duration: Math.round(performance.now() - started),
  }
  self.postMessage(answer)
})
