import type { JSX } from 'react'
import type { Network, Work } from './data'
import { topWorks } from './data'
import { messages } from './messages'

function Works({
  title,
  works,
  onPick,
}: {
  readonly title: string
  readonly works: readonly Work[]
  readonly onPick: (work: Work) => void
}): JSX.Element {
  return (
    <div className="cite-links">
      <h3>{title}</h3>
      {works.length === 0 ? (
        <p className="cite-note">{messages.details.none}</p>
      ) : (
        <ul>
          {works.map((work) => (
            <li key={work.id}>
              <button className="cite-link" type="button" onClick={() => onPick(work)}>
                <span>{work.title}</span>
                <small>{work.year ?? ''}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Details({
  network,
  work,
  onPick,
}: {
  readonly network: Network
  readonly work: Work
  readonly onPick: (work: Work) => void
}): JSX.Element {
  const outgoing = topWorks(network.citingOf.get(work.id) ?? [])
  const incoming = topWorks(network.citedByOf.get(work.id) ?? [])
  return (
    <div className="cite-details">
      <h3 className="cite-name">{work.title}</h3>
      <p className="cite-note">{messages.details.year(work.year)}</p>
      <p className="cite-note">{messages.details.author(work.author)}</p>
      <p className="cite-note">{messages.details.citations(work.citations)}</p>
      <Works title={messages.details.outgoing(work.outgoing)} works={outgoing} onPick={onPick} />
      <Works title={messages.details.incoming(work.incoming)} works={incoming} onPick={onPick} />
      <a
        className="cite-note"
        href={messages.details.workLink(work.id)}
        target="_blank"
        rel="noreferrer"
      >
        {messages.details.openalex}
      </a>
    </div>
  )
}
