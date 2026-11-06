import { defineGraph, type ElementKeys, edges, type Key, nodes } from '@bruno00o/graph'
import { graphDevtoolsPlugin } from '@bruno00o/graph/devtools/react'
import { Graph, type GraphInstance, useGraph, useGraphState } from '@bruno00o/graph/react'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { StrictMode, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'

const nodeCount = Number(new URLSearchParams(location.search).get('nodes') ?? 2_000)
const sample = createSample(nodeCount, nodeCount * 2)
const byId = new Map(sample.items.map((item) => [item.id, item]))
const devtoolsPlugins = [graphDevtoolsPlugin({ defaultOpen: true })]

function Tooltip() {
  const graph = useGraph()
  const hovered = useGraphState((state) => state.hovered)
  useGraphState((state) => state.view)
  useGraphState((state) => state.positionsVersion)
  if (hovered?.kind !== 'node') return null
  const item = hovered.datum as Item
  const position = graph.positions.get(hovered.key)
  if (!position) return null
  const point = graph.view.toScreen(position)
  return (
    <div
      className="tooltip"
      style={{ transform: `translate(${point.x + 12}px, ${point.y + 12}px)` }}
    >
      <strong>{item.label}</strong>
      <span>
        {item.group}, {messages.weight.toLowerCase()} {formatNumber(item.weight)}
      </span>
    </div>
  )
}

function SelectionPanel({ selected }: { readonly selected: readonly Key[] }) {
  return (
    <aside>
      <h2>{messages.selected}</h2>
      {selected.length === 0 ? (
        <p>{messages.empty}</p>
      ) : (
        <ul>
          {selected.map((key) => (
            <li key={key}>{byId.get(String(key))?.label}</li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function ThemeButton() {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const current = () => root.getAttribute('data-theme') ?? (media.matches ? 'dark' : 'light')
  const [theme, setTheme] = useState(current)
  const toggle = () => {
    const next = current() === 'dark' ? 'light' : 'dark'
    root.setAttribute('data-theme', next)
    setTheme(next)
  }
  return (
    <button type="button" onClick={toggle}>
      {theme === 'dark' ? messages.light : messages.dark}
    </button>
  )
}

function App() {
  const graph = useRef<GraphInstance | null>(null)
  const [selection, setSelection] = useState<ElementKeys>({ nodes: [], edges: [] })
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges<Link>(sample.links, { source: 'from', target: 'to', arrow: 'target' }),
          nodes<Item>(sample.items, {
            x: 'x',
            y: 'y',
            color: 'group',
            size: 'weight',
            label: 'label',
          }),
        ],
      }),
    [],
  )
  return (
    <>
      <header>
        <h1>{messages.react}</h1>
        <output aria-live="polite">
          {messages.selection(selection.nodes.length, selection.edges.length)}
        </output>
        <button type="button" onClick={() => graph.current?.view.fit(undefined, { duration: 400 })}>
          {messages.fit}
        </button>
        <ThemeButton />
      </header>
      <main className="layout">
        <Graph
          ref={graph}
          className="graph"
          definition={definition}
          ariaLabel={messages.graphLabel(
            formatNumber(sample.items.length),
            formatNumber(sample.links.length),
          )}
          onSelectionChange={setSelection}
        >
          <Tooltip />
        </Graph>
        <SelectionPanel selected={selection.nodes} />
      </main>
      <TanStackDevtools plugins={devtoolsPlugins} />
    </>
  )
}

document.title = messages.react
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
