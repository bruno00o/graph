import { defineGraph, edges, type Key, nodes, raw } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { Graph, type GraphInstance, useGraph, useGraphEvent } from '@bruno00o/graph/react'
import { type Ref, useState } from 'react'
import { createNesting, type Joint, type Part } from './data'
import { messages } from './messages'
import '../shared/overlays.css'
import './tree.css'

const { items, links, groups } = createNesting()
const parents = new Map(items.map((item) => [item.id, item.parent]))
const levels = [1, 2, 3]
const atLevel = (level: number): Key[] =>
  groups.filter((group) => group.depth === level).map((group) => group.id)

const definition = defineGraph({
  marks: [
    edges<Joint>(links, {
      source: 'from',
      target: 'to',
      opacity: 0.6,
      aggregate: { width: (aggregate) => aggregate.count },
    }),
    nodes<Part>(items, {
      parent: 'parent',
      color: 'tone',
      size: raw((item) => (item.depth === 4 ? 12 : 40 - item.depth * 6)),
      label: (item) => (item.depth === 4 ? null : item.label),
      container: { padding: 10 },
    }),
  ],
  scales: { width: (value) => 1 + value },
  layout: force({ edgeLength: 24 }),
  relayout: true,
})

function FitAfterLayout() {
  const graph = useGraph()
  useGraphEvent('layoutend', ({ completed }) => {
    if (completed) graph.view.fit(undefined, { duration: 400 })
  })
  return null
}

function Tree({ folded, onToggle }: { folded: readonly Key[]; onToggle: (key: Key) => void }) {
  const hiddenBy = (key: string): boolean => {
    const parent = parents.get(key)
    return parent ? folded.includes(parent) || hiddenBy(parent) : false
  }
  return (
    <nav className="example-panel tree-panel" aria-label={messages.treeLabel}>
      <ul>
        {groups.map((group) => (
          <li key={group.id} style={{ paddingLeft: (group.depth - 1) * 14 }}>
            <button
              type="button"
              aria-expanded={!folded.includes(group.id)}
              disabled={hiddenBy(group.id)}
              onClick={() => onToggle(group.id)}
            >
              {group.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [folded, setFolded] = useState<readonly Key[]>(() => atLevel(3))
  const toggle = (key: Key) =>
    setFolded((current) =>
      current.includes(key) ? current.filter((other) => other !== key) : [...current, key],
    )
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(items.length - groups.length, groups.length)}
      folded={folded}
      onFoldChange={(event) => setFolded(event.folded)}
    >
      <FitAfterLayout />
      <div className="example-actions">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            className="example-button"
            onClick={() => setFolded(atLevel(level))}
          >
            {messages.level(level)}
          </button>
        ))}
        <button type="button" className="example-button" onClick={() => setFolded([])}>
          {messages.openAll}
        </button>
      </div>
      <Tree folded={folded} onToggle={toggle} />
    </Graph>
  )
}
