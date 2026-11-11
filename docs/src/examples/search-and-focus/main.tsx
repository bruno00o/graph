import { defineGraph, edges, type Key, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { Graph, type GraphInstance, useGraph } from '@bruno00o/graph/react'
import { type KeyboardEvent, type Ref, useEffect, useId, useMemo, useState } from 'react'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import { createLabels } from './names'
import '../shared/overlays.css'
import './search.css'

const sample = createCommunities(300, 450)
const labels = createLabels(sample.items.length)
const items = sample.items.map((item, index) => ({ ...item, label: labels[index] ?? item.label }))
const links = sample.links
const shownLimit = 6

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const entries = items
  .map((item) => ({ key: item.id, label: item.label, folded: fold(item.label) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'en'))

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: { text: 'label', size: 14 } }),
  ],
  scales: { size: { range: [10, 30] } },
  states: {
    match: {
      nodes: {
        outline: 'var(--graph-accent)',
        outlineWidth: 3,
        label: 'always',
        raise: true,
        others: { opacity: 0.15, label: false },
      },
      edges: { others: { opacity: 0.08 } },
    },
  },
  layout: force(),
})

type Marks = (typeof definition.marks)[number]

function Search() {
  const graph = useGraph<'match', Marks>()
  const id = useId()
  const [query, setQuery] = useState('cafe')
  const [active, setActive] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const matches = useMemo(() => {
    const wanted = fold(query.trim())
    return wanted === '' ? [] : entries.filter((entry) => entry.folded.includes(wanted))
  }, [query])
  const shown = matches.slice(0, shownLimit)
  const selected = shown[active]

  useEffect(() => {
    if (matches.length === 0) graph.states.clear('match')
    else graph.states.set('match', { nodes: matches.map((entry) => entry.key) })
  }, [graph, matches])

  const change = (value: string) => {
    setQuery(value)
    setActive(0)
    setChosen(null)
  }

  const choose = (key: Key, label: string) => {
    const neighbors = graph.neighbors(key)
    setQuery('')
    setChosen(messages.chosen(label, neighbors.length))
    graph.selection.set({ nodes: [key] })
    graph.view.fit({ nodes: [key, ...neighbors], padding: 96, maxZoom: 2.5, duration: 500 })
    graph.focus.set({ kind: 'node', key })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(Math.min(Math.max(active + step, 0), shown.length - 1))
    } else if (event.key === 'Enter' && selected) {
      event.preventDefault()
      choose(selected.key, selected.label)
    } else if (event.key === 'Escape') {
      change('')
      graph.selection.clear()
    }
  }

  const status =
    chosen ??
    (query.trim() === ''
      ? ''
      : matches.length === 0
        ? messages.none
        : messages.matches(matches.length, shownLimit))

  return (
    <aside className="example-panel search-panel">
      <input
        type="search"
        role="combobox"
        aria-label={messages.search}
        aria-autocomplete="list"
        aria-expanded={shown.length > 0}
        aria-controls={`${id}-results`}
        aria-activedescendant={selected ? `${id}-${selected.key}` : undefined}
        placeholder={messages.placeholder}
        autoComplete="off"
        value={query}
        onChange={(event) => change(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div id={`${id}-results`} role="listbox" aria-label={messages.results} hidden={!shown.length}>
        {shown.map((entry, at) => (
          <div
            key={entry.key}
            id={`${id}-${entry.key}`}
            role="option"
            tabIndex={-1}
            aria-selected={at === active}
            onMouseDown={(event) => {
              event.preventDefault()
              choose(entry.key, entry.label)
            }}
          >
            {entry.label}
          </div>
        ))}
      </div>
      <output>{status}</output>
    </aside>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel(items.length, links.length)}
    >
      <Search />
    </Graph>
  )
}
