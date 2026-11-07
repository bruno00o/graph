import { defineGraph, edges, type Key, nodes } from '@bruno00o/graph'
import { Graph, type GraphInstance, useGraph } from '@bruno00o/graph/react'
import { type Ref, useState } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './list.css'

const limit = 4
const { items, links } = createSample(36, 60, 4, 12)
const sorted = [...items].sort(
  (a, b) =>
    a.group.localeCompare(b.group) || a.label.localeCompare(b.label, 'en', { numeric: true }),
)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { pointed: { outline: 'var(--graph-ink)', outlineWidth: 3, label: true, raise: true } },
})

interface NodeListProps {
  readonly selected: readonly Key[]
  readonly onToggle: (key: Key) => void
}

function NodeList({ selected, onToggle }: NodeListProps) {
  const graph = useGraph<'pointed'>()
  return (
    <aside className="example-list" onPointerLeave={() => graph.states.clear('pointed')}>
      <h2>{messages.title(selected.length, limit)}</h2>
      <ul>
        {sorted.map((item) => (
          <li
            key={item.id}
            onPointerEnter={() => graph.states.set('pointed', { nodes: [item.id] })}
          >
            <label>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => onToggle(item.id)}
              />
              {item.label}
              <span>{messages.group(item.group)}</span>
            </label>
          </li>
        ))}
      </ul>
    </aside>
  )
}

const keep = (keys: Iterable<Key>) => [...keys].slice(-limit)

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [selected, setSelected] = useState<readonly Key[]>(() =>
    sorted.slice(1, limit + 1).map((item) => item.id),
  )
  const toggle = (key: Key) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((other) => other !== key) : keep([...current, key]),
    )
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(items.length, links.length)}
      selection={{ nodes: selected }}
      onSelectionChange={({ selection }) => setSelected(keep(selection.nodes))}
    >
      <NodeList selected={selected} onToggle={toggle} />
    </Graph>
  )
}
