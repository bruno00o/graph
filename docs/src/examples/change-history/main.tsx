import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import {
  Graph,
  type GraphInstance,
  Timeline,
  useGraph,
  useTimeline,
} from '@bruno00o/graph/react'
import { type Ref, useLayoutEffect } from 'react'
import { createHistory, day, type Member, type Tie } from './history'
import { messages } from './messages'
import '../shared/overlays.css'
import './history.css'

const first = Date.UTC(2026, 8, 7)
const history = createHistory(first, 30)
const last = history.changes[history.changes.length - 1]?.at ?? first
const kinds = ['added', 'changed', 'removed']

const definition = defineGraph({
  marks: [
    edges<Tie>(history.ties, { source: 'from', target: 'to', opacity: 0.5 }),
    nodes<Member>(history.members, {
      size: 12,
      label: 'label',
      time: (member) => ({ start: member.start, end: member.end }),
    }),
  ],
  states: { current: { raise: true, halo: true, label: 'always' } },
  layout: force(),
  view: { padding: { top: 40, right: 250, bottom: 150, left: 40 } },
})

function Replay() {
  const graph = useGraph<'current'>()
  const { state, timeline } = useTimeline({
    events: history.changes,
    eventTime: 'at',
    eventKind: 'kind',
    kinds,
    instant: true,
    speed: day / 2,
  })
  const moment = state.window?.start ?? null
  const now = moment !== null && timeline ? timeline.events(moment) : []
  const keys = now.map((change) => change.node).join(' ')
  useLayoutEffect(() => {
    graph.states.set('current', { nodes: keys ? keys.split(' ') : [] })
  }, [graph, keys])
  return (
    <>
      <section className="example-panel change-panel" aria-live="polite">
        <h2>{moment === null ? messages.everything : messages.moment(moment)}</h2>
        {now.length === 0 ? (
          <p>{moment === null ? messages.pick : messages.quiet}</p>
        ) : (
          <ul>
            {now.map((change) => (
              <li key={change.id}>{messages.change(change.kind, change.node)}</li>
            ))}
          </ul>
        )}
      </section>
      <div className="example-timeline">
        <Timeline
          timeline={timeline}
          ariaLabel={messages.timeline}
          labels={messages.labels}
          kindText={messages.kind}
        />
      </div>
    </>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      initialTime={{ start: last, end: last }}
      ariaLabel={messages.graphLabel(history.members.length, history.changes.length)}
    >
      <Replay />
    </Graph>
  )
}
