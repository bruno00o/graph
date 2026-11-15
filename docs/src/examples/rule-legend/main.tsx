import { defineGraph, type EdgeMark, edges, type NodeMark, nodes, raw } from '@bruno00o/graph'
import type { LegendEntryGroup } from '@bruno00o/graph/legend'
import { Graph, type GraphInstance, Legend } from '@bruno00o/graph/react'
import type { Ref } from 'react'
import { createSample, type Item, type Link as Plain } from '../shared/data'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Link extends Plain {
  readonly strength: number
}

interface Rule {
  readonly id: 'heavy' | 'medium' | 'light' | 'strong' | 'weak'
  readonly min: number
  readonly max: number
  readonly color: string
  readonly width: number
  readonly dash: 'solid' | 'dashed'
}

const nodeRules: readonly Rule[] = [
  { id: 'heavy', min: 40, max: Infinity, color: 'var(--graph-cat-4)', width: 0, dash: 'solid' },
  { id: 'medium', min: 12, max: 40, color: 'var(--graph-cat-1)', width: 0, dash: 'solid' },
  { id: 'light', min: 0, max: 12, color: 'var(--graph-cat-3)', width: 0, dash: 'solid' },
]

const edgeRules: readonly Rule[] = [
  {
    id: 'strong',
    min: 0.85,
    max: Infinity,
    color: 'var(--graph-cat-2)',
    width: 2.5,
    dash: 'solid',
  },
  { id: 'weak', min: 0, max: 0.85, color: 'var(--graph-edge)', width: 1, dash: 'dashed' },
]

const covers = (rule: Rule, value: number) => value >= rule.min && value < rule.max
const nodeRuleOf = (item: Item) => nodeRules.find((rule) => covers(rule, item.weight))
const edgeRuleOf = (link: Link) => edgeRules.find((rule) => covers(rule, link.strength))

type Marks = NodeMark<Item> | EdgeMark<Link>

const entries: readonly LegendEntryGroup<Marks>[] = [
  {
    title: messages.nodeTitle,
    entries: nodeRules.map((rule) => ({
      id: rule.id,
      label: messages[rule.id],
      swatch: { kind: 'nodes', fill: rule.color },
      nodes: (item: Item) => covers(rule, item.weight),
    })),
  },
  {
    title: messages.edgeTitle,
    entries: edgeRules.map((rule) => ({
      id: rule.id,
      label: messages[rule.id],
      swatch: { kind: 'edges', color: rule.color, width: rule.width, dash: rule.dash },
      edges: (link: Link) => covers(rule, link.strength),
    })),
  },
  {
    title: messages.stateTitle,
    entries: [
      {
        id: 'selected',
        label: messages.selected,
        swatch: { kind: 'nodes', fill: 'transparent', stroke: 'var(--graph-accent)' },
      },
    ],
  },
]

const sample = createSample(600, 900, 6, 31, 0.05)
const next = random(31)
const items = sample.items
const links: Link[] = sample.links.map((link) => ({ ...link, strength: next() }))

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      stroke: (link) => edgeRuleOf(link)?.color ?? 'var(--graph-edge)',
      width: raw((link) => edgeRuleOf(link)?.width ?? 1),
      dash: (link) => edgeRuleOf(link)?.dash ?? 'solid',
    }),
    nodes<Item>(items, {
      x: 'x',
      y: 'y',
      size: 'weight',
      fill: (item) => nodeRuleOf(item)?.color ?? 'var(--graph-node)',
    }),
  ],
  states: {
    match: { outline: 'var(--graph-ink)', outlineWidth: 2, raise: true },
    off: { hide: true },
  },
})

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(items.length, links.length)}
    >
      <div className="example-scale-legend">
        <Legend
          entries={entries}
          highlight="match"
          hidden="off"
          sections={['entries']}
          ariaLabel={messages.legendLabel}
        />
      </div>
    </Graph>
  )
}
