import { Graph, Minimap, Timeline, useGraph } from '@bruno00o/graph/react'
import { type JSX, type ReactNode, useEffect, useRef } from 'react'
import { yearMs } from './data'
import type { WorkDefinition, WorkGraph, WorkMark, WorkState } from './definition'
import { messages } from './messages'

export type Report = (graph: WorkGraph | null) => void

function Expose({ report }: { readonly report: Report }): null {
  const graph = useGraph<WorkState, WorkMark>()
  const latest = useRef(report)
  latest.current = report
  useEffect(() => {
    latest.current(graph)
    return () => latest.current(null)
  }, [graph])
  return null
}

export function Stage({
  definition,
  label,
  report,
  children,
}: {
  readonly definition: WorkDefinition
  readonly label: string
  readonly report: Report
  readonly children?: ReactNode
}): JSX.Element {
  return (
    <Graph definition={definition} ariaLabel={label} style={{ position: 'absolute', inset: 0 }}>
      <Expose report={report} />
      <Minimap corner="topRight" width={160} height={120} />
      <div className="cite-timeline">
        <Timeline
          mode="grow"
          speed={4 * yearMs}
          ariaLabel={messages.timeline}
          labels={messages.timelineLabels}
        />
      </div>
      {children}
    </Graph>
  )
}
