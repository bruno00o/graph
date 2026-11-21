# Many extracts on worker threads

A graph without a page works on one thread. To write many files, give each worker thread its share of the jobs, one graph at a time, and read the font once per thread. The script below is a short form of `scripts/server-extracts.mjs` of the repository, which the CI runs (`pnpm docs:extracts`, with generated data and the DejaVu Sans file of the `dejavu-fonts-ttf` package).

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads'
import { Resvg } from '@resvg/resvg-js'
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { exportSvg } from '@bruno00o/graph/export'
import { createGraph, type FontFile, readFont } from '@bruno00o/graph/headless'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }
type Job = { name: string; items: Item[]; links: Link[] }

const fontFile = 'fonts/DejaVuSans.ttf'

async function extract(font: FontFile, job: Job) {
  const graph = createGraph({
    definition: defineGraph({
      marks: [
        nodes(job.items, { label: 'label' }),
        edges(job.links, { source: 'from', target: 'to', arrow: 'target' }),
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
    font: { loadSystemFonts: false, fontFiles: [fontFile], defaultFontFamily: font.family },
  })
    .render()
    .asPng()
  return { svg, png }
}

if (isMainThread) {
  const jobs: Job[] = []
  const threads = Math.max(1, Math.min(4, availableParallelism() - 1))
  await Promise.all(
    Array.from({ length: threads }, (_, thread) => {
      const share = jobs.filter((_, at) => at % threads === thread)
      const worker = new Worker(new URL(import.meta.url), { workerData: share })
      return new Promise((resolve, reject) => {
        worker.once('message', resolve)
        worker.once('error', reject)
      })
    }),
  )
} else {
  const font = readFont(readFileSync(fontFile))
  for (const job of workerData as Job[]) {
    const { svg, png } = await extract(font, job)
    writeFileSync(`${job.name}.svg`, svg)
    writeFileSync(`${job.name}.png`, png)
  }
  parentPort?.postMessage('done')
}
```

- Send the worker data it needs to build the graph (arrays of plain objects). Send file paths, not buffers, for fonts and images, and read them in the worker.
- A thread that ends its share posts a message; a thread that throws rejects the promise of the main thread.
- Run the file as an ES module: `new URL(import.meta.url)` starts the same file in the worker, and the `isMainThread` test picks the side.

## Rates

Graphs per second, from the start of the threads to the last graph done, with the force layout, labels, arrows and an image 1,600 pixels wide, in Node 24 on Linux with 12 cores:

| Threads | 200 nodes, SVG | 200 nodes, SVG and PNG | 2,000 nodes, SVG | 2,000 nodes, SVG and PNG |
| --- | --- | --- | --- | --- |
| 1 | 44 | 8.1 | 4.9 | 3.0 |
| 2 | 76 | 15 | 9.3 | 5.6 |
| 4 | 150 | 30 | 18 | 11 |
| 8 | 248 | 54 | 30 | 19 |

At 200 nodes, the layout takes 17 ms and the SVG 3 ms, while resvg takes about 70 ms to draw the image and 25 ms to encode the PNG. At 2,000 nodes, the layout takes about half of the time. Size the number of threads to the cores, and keep one for the rest of the program.

## The font file on macOS

On macOS, resvg threads that load the same font file slow each other down: at 200 nodes, the rate with the PNG stays near 24 graphs per second from four threads on, and a copy of the file for each thread brings eight threads to 42. The table above, measured on Linux, scales with the threads: measure on your platform before copying files.

## Fonts and weights

`readFont` reads one face, so one file measures every label whatever its weight. Labels are drawn at weight 500 by default, which resvg takes from the regular face when no medium one is loaded. For bold labels, load the bold file in resvg too (add it to `fontFiles`), read both with `readFont`, and pass a `measureText` that picks the widths of each file by `weight`:

```ts
import type { FontFile } from '@bruno00o/graph/headless'

export function byWeight(regular: FontFile, bold: FontFile) {
  return (text: string, weight: number, font: string | null) =>
    weight >= 600 ? bold.width(text, weight, font) : regular.width(text, weight, font)
}
```
