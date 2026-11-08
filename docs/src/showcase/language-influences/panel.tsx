import { Legend } from '@bruno00o/graph/react'
import { type JSX, useId, useMemo, useState } from 'react'
import { type Language, type Network, paradigmName, searchLanguages } from './data'
import {
  type Depth,
  type Direction,
  depths,
  directions,
  type LanguageGraph,
  type LayoutId,
  layoutIds,
} from './definition'
import { Details } from './details'
import { dataAttribution, messages } from './messages'

export interface PanelProps {
  readonly network: Network | null
  readonly graph: LanguageGraph | null
  readonly layout: LayoutId
  readonly onLayout: (layout: LayoutId) => void
  readonly direction: Direction
  readonly onDirection: (direction: Direction) => void
  readonly grouped: boolean
  readonly onGrouped: (grouped: boolean) => void
  readonly depth: Depth
  readonly onDepth: (depth: Depth) => void
  readonly alone: boolean
  readonly onAlone: (alone: boolean) => void
  readonly selected: Language | null
  readonly lineage: { readonly before: number; readonly after: number } | null
  readonly shown: { readonly languages: number; readonly influences: number } | null
  readonly onPick: (language: Language) => void
  readonly onClear: () => void
  readonly onFold: (folded: boolean) => void
}

function Search({
  network,
  onPick,
  onClear,
  hasSelection,
}: {
  readonly network: Network | null
  readonly onPick: (language: Language) => void
  readonly onClear: () => void
  readonly hasSelection: boolean
}): JSX.Element {
  const id = useId()
  const [query, setQuery] = useState('')
  const results = useMemo(() => (network ? searchLanguages(network, query) : []), [network, query])
  const choose = (language: Language) => {
    onPick(language)
    setQuery(language.name)
  }
  return (
    <section className="lang-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{messages.search.title}</h2>
      <div className="lang-search">
        <input
          type="search"
          aria-label={messages.search.label}
          placeholder={messages.search.placeholder}
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
        {hasSelection ? (
          <button
            className="lang-button lang-button-small"
            type="button"
            onClick={() => {
              setQuery('')
              onClear()
            }}
          >
            {messages.actions.clear}
          </button>
        ) : null}
      </div>
      {query.trim() !== '' ? (
        <ul className="lang-results" aria-label={messages.search.results}>
          {results.length === 0 ? (
            <li className="lang-results-none">{messages.search.none}</li>
          ) : (
            results.map((language) => (
              <li key={language.id}>
                <button className="lang-result" type="button" onClick={() => choose(language)}>
                  <strong>{language.name}</strong>
                  <span>{messages.search.result(language.year)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  )
}

export function Panel(props: PanelProps): JSX.Element {
  const { network, graph, layout, direction, grouped, alone, depth, selected, lineage } = props
  const id = useId()
  return (
    <aside className="lang-panel" aria-label={messages.panel}>
      <Search
        network={network}
        onPick={props.onPick}
        onClear={props.onClear}
        hasSelection={selected !== null}
      />

      <section className="lang-section" aria-labelledby={`${id}-lineage`}>
        <h2 id={`${id}-lineage`}>{messages.lineage.title}</h2>
        <label className="lang-field">
          <span>{messages.lineage.depth}</span>
          <select
            value={String(depth)}
            onChange={(event) => {
              const next = depths.find((item) => String(item) === event.target.value)
              if (next !== undefined) props.onDepth(next)
            }}
          >
            {depths.map((item) => (
              <option key={item} value={String(item)}>
                {messages.lineage.depths[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="lang-check">
          <input
            type="checkbox"
            checked={alone}
            onChange={(event) => props.onAlone(event.target.checked)}
          />
          <span>{messages.lineage.alone}</span>
        </label>
        {selected && lineage ? (
          <>
            <p className="lang-note" role="status">
              {messages.lineage.summary(lineage.before, lineage.after)}
            </p>
            <p className="lang-key">
              <span className="lang-swatch lang-swatch-before" />
              {messages.lineage.ancestors}
              <span className="lang-swatch lang-swatch-after" />
              {messages.lineage.descendants}
            </p>
          </>
        ) : (
          <p className="lang-note">{messages.lineage.hint}</p>
        )}
        {network && selected ? (
          <Details network={network} language={selected} onPick={props.onPick} />
        ) : null}
      </section>

      <section className="lang-section" aria-labelledby={`${id}-view`}>
        <h2 id={`${id}-view`}>{messages.view.title}</h2>
        <label className="lang-field">
          <span>{messages.view.layout}</span>
          <select
            value={layout}
            onChange={(event) => {
              const next = layoutIds.find((item) => item === event.target.value)
              if (next) props.onLayout(next)
            }}
          >
            {layoutIds.map((item) => (
              <option key={item} value={item}>
                {messages.view.layouts[item]}
              </option>
            ))}
          </select>
        </label>
        {layout === 'layers' ? (
          <label className="lang-field">
            <span>{messages.view.direction}</span>
            <select
              value={direction}
              onChange={(event) => {
                const next = directions.find((item) => item === event.target.value)
                if (next) props.onDirection(next)
              }}
            >
              {directions.map((item) => (
                <option key={item} value={item}>
                  {messages.view.directions[item]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="lang-check">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => props.onGrouped(event.target.checked)}
          />
          <span>{messages.view.group}</span>
        </label>
        {grouped ? (
          <div className="lang-row">
            <button
              className="lang-button lang-button-small"
              type="button"
              onClick={() => props.onFold(true)}
            >
              {messages.view.foldAll}
            </button>
            <button
              className="lang-button lang-button-small"
              type="button"
              onClick={() => props.onFold(false)}
            >
              {messages.view.unfoldAll}
            </button>
          </div>
        ) : null}
      </section>

      <section className="lang-section" aria-labelledby={`${id}-legend`}>
        <h2 id={`${id}-legend`}>{messages.legend.title}</h2>
        {graph ? (
          <Legend
            graph={graph}
            highlight="focus"
            hidden="off"
            sections={['color']}
            format={(value) => paradigmName(String(value))}
            ariaLabel={messages.legend.label}
          />
        ) : null}
        <p className="lang-note">{messages.view.mainHint}</p>
      </section>

      <section className="lang-section" aria-labelledby={`${id}-time`}>
        <h2 id={`${id}-time`}>{messages.time.title}</h2>
        {network ? (
          <>
            <p className="lang-note">{messages.time.hint(network.untimed)}</p>
            <button
              className="lang-button lang-button-small"
              type="button"
              onClick={() => graph?.time.set(null)}
            >
              {messages.time.showAll}
            </button>
          </>
        ) : null}
      </section>

      <section className="lang-section lang-foot">
        {network ? (
          <p className="lang-note" role="status">
            {props.shown
              ? messages.status.alone(props.shown.languages, props.shown.influences)
              : messages.status.shown(network.languages.length, network.influences.length)}
          </p>
        ) : null}
        <p className="lang-note">{messages.status.hint}</p>
        <p className="lang-credit">
          {dataAttribution.before}
          <a href={dataAttribution.url}>{dataAttribution.name}</a>
          {' ('}
          {dataAttribution.url}
          {'), '}
          <a href={dataAttribution.licenseUrl}>{dataAttribution.licenseText}</a>
          {dataAttribution.after}
        </p>
      </section>
    </aside>
  )
}
