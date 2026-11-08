import { Legend } from '@bruno00o/graph/react'
import { type JSX, useEffect, useId, useMemo, useState } from 'react'
import type { Network, Work } from './data'
import { searchWorks } from './data'
import { type Depth, depths, type WorkGraph } from './definition'
import { Details } from './details'
import { dataAttribution, messages } from './messages'

export interface PanelProps {
  readonly network: Network | null
  readonly graph: WorkGraph | null
  readonly depth: Depth
  readonly onDepth: (depth: Depth) => void
  readonly selected: Work | null
  readonly neighborhood: { readonly outgoing: number; readonly incoming: number } | null
  readonly path: {
    readonly from: string | null
    readonly to: string | null
    readonly nodes: readonly string[] | null
    readonly pending: boolean
  }
  readonly onPick: (work: Work) => void
  readonly onQuery: (side: 'from' | 'to', work: Work) => void
  readonly onClear: () => void
}

function Search({
  network,
  label,
  placeholder,
  onPick,
}: {
  readonly network: Network | null
  readonly label: string
  readonly placeholder: string
  readonly onPick: (work: Work) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(() => (network ? searchWorks(network, query) : []), [network, query])
  const choose = (work: Work) => {
    onPick(work)
    setQuery('')
  }
  return (
    <div className="cite-search">
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={query}
        disabled={!network}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          const first = results[0]
          if (event.key === 'Enter' && first) {
            event.preventDefault()
            choose(first)
          } else if (event.key === 'Escape') {
            setQuery('')
          }
        }}
      />
      {query.trim() === '' ? null : (
        <ul className="cite-results" aria-label={messages.search.results}>
          {results.length === 0 ? (
            <li className="cite-results-none">{messages.search.none}</li>
          ) : (
            results.map((work) => (
              <li key={work.id}>
                <button className="cite-result" type="button" onClick={() => choose(work)}>
                  <strong>{work.title}</strong>
                  <span>{messages.search.result(work)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export function Panel(props: PanelProps): JSX.Element {
  const { network, graph, depth, selected, neighborhood, path, onClear } = props
  const id = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClear()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClear])
  return (
    <aside className="cite-panel" aria-label={messages.panel}>
      <section className="cite-section" aria-labelledby={`${id}-search`}>
        <h2 id={`${id}-search`}>{messages.search.title}</h2>
        <Search
          network={network}
          label={messages.search.label}
          placeholder={messages.search.placeholder}
          onPick={props.onPick}
        />
        {selected && network ? (
          <>
            <Details network={network} work={selected} onPick={props.onPick} />
            <button className="cite-button cite-button-small" type="button" onClick={onClear}>
              {messages.actions.clear}
            </button>
          </>
        ) : (
          <p className="cite-note">{messages.neighborhood.hint}</p>
        )}
      </section>

      <section className="cite-section" aria-labelledby={`${id}-neighborhood`}>
        <h2 id={`${id}-neighborhood`}>{messages.neighborhood.title}</h2>
        <label className="cite-field">
          <span>{messages.neighborhood.depth}</span>
          <select
            value={String(depth)}
            onChange={(event) => {
              const next = depths.find((item) => String(item) === event.target.value)
              if (next !== undefined) props.onDepth(next)
            }}
          >
            {depths.map((item) => (
              <option key={item} value={String(item)}>
                {messages.neighborhood.depths[item]}
              </option>
            ))}
          </select>
        </label>
        {selected && neighborhood ? (
          <p className="cite-note" role="status">
            {messages.neighborhood.summary(neighborhood.outgoing, neighborhood.incoming)}
            <span className="cite-key">
              <span className="cite-swatch cite-swatch-out" />
              {messages.neighborhood.cites}
              <span className="cite-swatch cite-swatch-in" />
              {messages.neighborhood.citedBy}
            </span>
          </p>
        ) : null}
      </section>

      <section className="cite-section" aria-labelledby={`${id}-path`}>
        <h2 id={`${id}-path`}>{messages.path.title}</h2>
        <Search
          network={network}
          label={messages.path.from}
          placeholder={messages.path.placeholderFrom}
          onPick={(work) => props.onQuery('from', work)}
        />
        <Search
          network={network}
          label={messages.path.to}
          placeholder={messages.path.placeholderTo}
          onPick={(work) => props.onQuery('to', work)}
        />
        <p className="cite-note" role="status">
          {!path.pending && path.from !== null && path.to !== null
            ? path.nodes === null
              ? messages.path.none
              : messages.path.steps(path.nodes.length - 1)
            : messages.path.hint}
        </p>
        {path.nodes && path.nodes.length > 0 ? (
          <div className="cite-links">
            <h3>{messages.path.nodes}</h3>
            <ul>
              {path.nodes.map((key, at) => {
                const work = network?.byId.get(key)
                if (!work) return null
                return (
                  <li key={key}>
                    <button className="cite-link" type="button" onClick={() => props.onPick(work)}>
                      <span>
                        {at + 1}. {work.title}
                      </span>
                      <small>{work.year ?? ''}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="cite-section" aria-labelledby={`${id}-legend`}>
        <h2 id={`${id}-legend`}>{messages.legend.title}</h2>
        {graph ? (
          <Legend
            graph={graph}
            sections={['color']}
            format={messages.legend.format}
            ariaLabel={messages.legend.label}
          />
        ) : null}
      </section>

      <section className="cite-section" aria-labelledby={`${id}-time`}>
        <h2 id={`${id}-time`}>{messages.time.title}</h2>
        {network ? (
          <>
            <p className="cite-note">{messages.time.hint(network.untimed)}</p>
            <p className="cite-note">{messages.time.range(network.firstYear, network.lastYear)}</p>
            <button
              className="cite-button cite-button-small"
              type="button"
              onClick={() => graph?.time.set(null)}
            >
              {messages.time.showAll}
            </button>
          </>
        ) : null}
      </section>

      <section className="cite-section cite-foot">
        <p className="cite-note" role="status">
          {network
            ? messages.status.shown(network.works.length, network.links.length)
            : messages.loading}
        </p>
        <p className="cite-note">{messages.status.hint}</p>
        {network ? <p className="cite-note">{messages.topic(network.topic.name)}</p> : null}
        <p className="cite-credit">
          {dataAttribution.before}
          <a href={dataAttribution.url}>{dataAttribution.name}</a>
          {' ('}
          {dataAttribution.url}
          {'), '}
          <a href={dataAttribution.licenseUrl}>{dataAttribution.licenseText}</a>
          {network ? dataAttribution.retrieved(network.retrieved.slice(0, 10)) : ''}.{' '}
          {dataAttribution.snapshot}
        </p>
      </section>
    </aside>
  )
}
