import { Anchor, useGraphState } from '@bruno00o/graph/react'
import type { JSX } from 'react'
import type { WorkGraphState } from './definition'
import { messages } from './messages'

export function Tooltip(): JSX.Element | null {
  const hovered = useGraphState((state: WorkGraphState) => state.hovered)
  if (hovered?.kind !== 'node' || hovered.mark !== 'works') return null
  const work = hovered.datum
  return (
    <Anchor node={hovered.key} side="top" align="center" offset={{ x: 0, y: -4 }}>
      <div className="cite-tooltip">
        <strong>{work.title}</strong>
        <span>
          {messages.tooltip.year(work.year)}
          {work.author === null ? '' : ` ${messages.tooltip.author(work.author)}`}
        </span>
        <span>{messages.tooltip.citations(work.citations)}</span>
      </div>
    </Anchor>
  )
}
