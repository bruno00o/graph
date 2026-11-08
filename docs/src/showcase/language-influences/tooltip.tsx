import { Anchor, useGraphState } from '@bruno00o/graph/react'
import type { JSX } from 'react'
import { type Network, paradigmName } from './data'
import type { LanguageGraphState } from './definition'
import { messages } from './messages'

export function Tooltip({ network }: { readonly network: Network }): JSX.Element | null {
  const hovered = useGraphState((state: LanguageGraphState) => state.hovered)
  if (hovered?.kind !== 'node') return null
  if (hovered.mark === 'paradigms') {
    const group = hovered.datum
    return (
      <Anchor node={hovered.key} side="top" align="center" offset={{ x: 0, y: -6 }}>
        <div className="lang-tooltip">
          <strong>{paradigmName(String(group.value))}</strong>
          <span>{messages.details.group(paradigmName(String(group.value)), group.count)}</span>
        </div>
      </Anchor>
    )
  }
  const language = hovered.datum
  const before = network.influencersOf.get(language.id)?.length ?? 0
  const after = network.influencedOf.get(language.id)?.length ?? 0
  return (
    <Anchor node={hovered.key} side="top" align="center" offset={{ x: 0, y: -4 }}>
      <div className="lang-tooltip">
        <strong>{language.name}</strong>
        <span>{messages.tooltip.year(language.year)}</span>
        <span>{messages.tooltip.links(before, after)}</span>
      </div>
    </Anchor>
  )
}
