import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, type GraphInstance } from '@bruno00o/graph/react'
import { type Ref, useEffect, useState } from 'react'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './many.css'

const count = 20

const cards = Array.from({ length: count }, (_, index) => {
  const { items, links } = createSample(30, 42, 3, 100 + index, 0.05)
  const definition = defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
      nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight' }),
    ],
    scales: { size: { range: [8, 18] } },
    interaction: { wheel: 'page' },
  })
  return { id: `card-${index}`, definition }
})

function Card({
  index,
  definition,
  graphRef,
  onActive,
}: {
  readonly index: number
  readonly definition: (typeof cards)[number]['definition']
  readonly graphRef: Ref<GraphInstance | null> | undefined
  readonly onActive: (index: number, active: boolean) => void
}) {
  const [card, setCard] = useState<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!card) return
    const observer = new IntersectionObserver(([entry]) => setShown(entry?.isIntersecting ?? false))
    observer.observe(card)
    return () => observer.disconnect()
  }, [card])
  return (
    <section ref={setCard} className="many-card">
      <Graph
        ref={graphRef}
        className="example-graph"
        definition={definition}
        ariaLabel={messages.graphLabel(index + 1)}
        suspended={!shown}
        onSuspendChange={({ suspended }) => onActive(index, !suspended)}
      />
      <span className="many-title">{messages.title(index + 1)}</span>
    </section>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [active, setActive] = useState<ReadonlySet<number>>(new Set())
  const onActive = (index: number, on: boolean) =>
    setActive((previous) => {
      if (previous.has(index) === on) return previous
      const next = new Set(previous)
      if (on) next.add(index)
      else next.delete(index)
      return next
    })
  return (
    <div className="many">
      <div className="many-scroll">
        <div className="many-grid">
          {cards.map((card, index) => (
            <Card
              key={card.id}
              index={index}
              definition={card.definition}
              graphRef={index === 0 ? ref : undefined}
              onActive={onActive}
            />
          ))}
        </div>
      </div>
      <output className="example-panel many-count">{messages.active(active.size, count)}</output>
    </div>
  )
}
