import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import {
  Graph,
  type GraphInstance,
  useGraph,
  useGraphEvent,
  useTimeline,
} from '@bruno00o/graph/react'
import { type Ref, useMemo, useState } from 'react'
import { createHistory, type TimedItem, type TimedLink } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './slider.css'

const day = 86_400_000
const history = createHistory(160, 260)

const definition = defineGraph({
  marks: [
    edges<TimedLink>(history.links, {
      source: 'from',
      target: 'to',
      opacity: 0.6,
      time: (link) => ({ start: link.start, end: link.end }),
    }),
    nodes<TimedItem>(history.items, {
      color: 'group',
      size: 'weight',
      label: 'label',
      time: (item) => ({ start: item.start, end: item.end }),
    }),
  ],
  scales: { size: { range: [14, 44] } },
  layout: force(),
})

function alive(moment: number): number {
  return history.items.filter((item) => item.start <= moment && (item.end ?? Infinity) > moment)
    .length
}

function MomentSlider({
  moment,
  onChange,
}: {
  readonly moment: number
  readonly onChange: (moment: number) => void
}) {
  const graph = useGraph()
  useGraphEvent('layoutend', () => graph.view.fit(undefined, { padding: 90, duration: 300 }))
  const { state } = useTimeline({ bins: 48 })
  const { extent, bins } = state
  if (!extent) return null
  const peak = Math.max(1, ...bins.map((bin) => bin.nodes))
  return (
    <div className="moment-slider">
      <div className="moment-bins" aria-hidden="true">
        {bins.map((bin) => (
          <span
            key={bin.start}
            data-current={bin.start <= moment && moment < bin.end ? '' : undefined}
            style={{ height: `${(bin.nodes / peak) * 100}%` }}
          />
        ))}
      </div>
      <input
        type="range"
        min={extent.start}
        max={extent.end - day}
        step={day}
        value={moment}
        aria-label={messages.slider}
        aria-valuetext={messages.moment(moment)}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{messages.status(moment, alive(moment))}</output>
    </div>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [moment, setMoment] = useState(history.start + 1_000 * day)
  const time = useMemo(() => ({ start: moment, end: moment }), [moment])
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      time={time}
      onTimeChange={(event) => {
        if (typeof event.window?.start === 'number') setMoment(event.window.start)
      }}
      ariaLabel={messages.graphLabel(history.items.length, history.links.length)}
    >
      <MomentSlider moment={moment} onChange={setMoment} />
    </Graph>
  )
}
