import type { JSX } from 'react'
import { type Language, type Network, paradigmName } from './data'
import { messages } from './messages'

function Links({
  title,
  languages,
  onPick,
}: {
  readonly title: string
  readonly languages: readonly Language[]
  readonly onPick: (language: Language) => void
}): JSX.Element {
  return (
    <div className="lang-links">
      <h3>{title}</h3>
      {languages.length === 0 ? (
        <p className="lang-note">{messages.details.none}</p>
      ) : (
        <ul>
          {languages.map((language) => (
            <li key={language.id}>
              <button className="lang-link" type="button" onClick={() => onPick(language)}>
                <span>{language.name}</span>
                <small>{language.year ?? ''}</small>
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
  language,
  onPick,
}: {
  readonly network: Network
  readonly language: Language
  readonly onPick: (language: Language) => void
}): JSX.Element {
  const before = network.influencersOf.get(language.id) ?? []
  const after = network.influencedOf.get(language.id) ?? []
  return (
    <div className="lang-details">
      <h3 className="lang-name">{language.name}</h3>
      <p className="lang-note">{messages.details.year(language.year)}</p>
      <p className="lang-note">
        {messages.details.paradigms}:{' '}
        {language.paradigms.length === 0
          ? messages.details.noParadigms
          : language.paradigms.map(paradigmName).join(', ')}
      </p>
      <Links title={messages.details.ancestors(before.length)} languages={before} onPick={onPick} />
      <Links title={messages.details.descendants(after.length)} languages={after} onPick={onPick} />
      {language.name === language.id ? (
        <p className="lang-note">{messages.details.unnamed}</p>
      ) : null}
      <a
        className="lang-note"
        href={`https://www.wikidata.org/wiki/${language.id}`}
        target="_blank"
        rel="noreferrer"
      >
        {messages.details.wikidata}
      </a>
    </div>
  )
}
