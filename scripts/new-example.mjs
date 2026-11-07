import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { docsExamples, docsExamplesDirectory, root } from './harness.mjs'

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: { react: { type: 'boolean', default: false } },
})

const { categories } = await import(
  pathToFileURL(join(docsExamplesDirectory, 'categories.ts')).href
)
const [slug, category] = positionals
const ids = categories.map((item) => item.id)

if (!slug || !category || positionals.length > 2) {
  throw new Error(
    `Usage: pnpm docs:new-example <slug> <category> [--react]\nCategories: ${ids.join(', ')}`,
  )
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error(`${slug}: use lowercase words joined by hyphens`)
}
if (!ids.includes(category)) {
  throw new Error(`${category}: unknown category, pick one of ${ids.join(', ')}`)
}
const folder = join(docsExamplesDirectory, slug)
if (existsSync(folder)) throw new Error(`${relative(root, folder)} already exists`)

const siblings = (await docsExamples()).filter((example) => example.meta.category === category)
const order =
  Math.floor(Math.max(0, ...siblings.map((example) => example.meta.order)) / 10) * 10 + 10
const title = slug.replaceAll('-', ' ').replace(/^./, (letter) => letter.toUpperCase())
const framework = options.react ? 'React' : 'Vanilla'

const meta = `import type { ExampleMeta } from '../types'

export default {
  title: '${title}',
  description: 'One or two sentences on what the example shows.',
  hint: 'One sentence on what to try.',
  category: '${category}',
  order: ${order},
  tags: ['${framework}'],
  api: ['define-graph'],
  guides: [],
} satisfies ExampleMeta
`

const messages = `export const messages = {
  graphLabel: 'Graph of two hundred nodes in eight groups',
} as const
`

const definition = `const { items, links } = createSample(200, 400)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})
`

const vanilla = `import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'

${definition}
export function mount(container: HTMLElement): GraphInstance {
  return mountGraph(container, { definition, ariaLabel: messages.graphLabel })
}
`

const react = `import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import type { Ref } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

${definition}
export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel}
    />
  )
}
`

mkdirSync(folder)
const files = {
  'meta.ts': meta,
  'messages.ts': messages,
  [options.react ? 'main.tsx' : 'main.ts']: options.react ? react : vanilla,
}
for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content)

console.log(`Created ${relative(root, folder)}: ${Object.keys(files).join(', ')}
Next:
  1. Write the example in ${options.react ? 'main.tsx' : 'main.ts'}, its text in messages.ts, and fill meta.ts.
  2. pnpm docs:dev, then open /examples/${slug}.
  3. pnpm docs:thumbnails ${slug}
  4. pnpm verify && pnpm docs:build && pnpm test:browsers --example 'docs/${slug}'`)
