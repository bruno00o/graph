import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { GraphDevtoolsPanel } from '@bruno00o/graph/devtools/react'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { type Ref, useMemo, useState, useSyncExternalStore } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'
import './devtools.css'

const sizes = [2_000, 10_000, 50_000]

function subscribeTheme(change: () => void): () => void {
  const observer = new MutationObserver(change)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function usePageTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light',
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [size, setSize] = useState(sizes[0] ?? 2_000)
  const theme = usePageTheme()
  const sample = useMemo(() => createSample(size, size * 2), [size])
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges<Link>(sample.links, { source: 'from', target: 'to' }),
          nodes<Item>(sample.items, {
            x: 'x',
            y: 'y',
            color: 'group',
            size: 'weight',
            label: 'label',
          }),
        ],
      }),
    [sample],
  )
  return (
    <div className="devtools-example">
      <Graph
        ref={ref}
        className="example-graph"
        definition={definition}
        ariaLabel={messages.graphLabel(sample.items.length, sample.links.length)}
      >
        <div className="example-actions">
          <button
            className="example-button"
            type="button"
            onClick={() => setSize(sizes[(sizes.indexOf(size) + 1) % sizes.length] ?? size)}
          >
            {messages.nodeCount(size)}
          </button>
        </div>
      </Graph>
      <GraphDevtoolsPanel theme={theme} />
    </div>
  )
}
