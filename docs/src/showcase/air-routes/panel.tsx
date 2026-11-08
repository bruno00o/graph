import { type JSX, useId, useMemo, useState } from 'react'
import {
  areaRadius,
  type DatasetId,
  type Filters,
  type Network,
  noFilters,
  type Place,
  searchPlaces,
} from './data'
import { type LayoutId, layoutIds, type Mode } from './definition'
import { type Basemap, basemaps, dataAttribution, messages } from './messages'

export interface PanelProps {
  readonly network: Network | null
  readonly dataset: DatasetId
  readonly onDataset: (dataset: DatasetId) => void
  readonly mode: Mode
  readonly onMode: (mode: Mode) => void
  readonly layout: LayoutId
  readonly onLayout: (layout: LayoutId) => void
  readonly basemap: Basemap
  readonly onBasemap: (basemap: Basemap) => void
  readonly grouped: boolean
  readonly onGrouped: (grouped: boolean) => void
  readonly filters: Filters
  readonly onFilters: (filters: Filters) => void
  readonly onPick: (place: Place) => void
  readonly onClear: () => void
  readonly hasFocus: boolean
  readonly counts: { readonly airports: number; readonly routes: number } | null
  readonly opened: number
  readonly mapError: string | null
}

const datasets: readonly DatasetId[] = ['europe', 'world']
const modes: readonly Mode[] = ['classic', 'map']
const minimumCap = 60

function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  readonly name: string
  readonly legend: string
  readonly value: T
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>
  readonly onChange: (value: T) => void
}): JSX.Element {
  return (
    <fieldset className="air-choice">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label className="air-button air-radio" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

function Search({
  network,
  onPick,
  onClear,
  hasFocus,
}: Pick<PanelProps, 'network' | 'onPick' | 'onClear' | 'hasFocus'>): JSX.Element {
  const id = useId()
  const [query, setQuery] = useState('')
  const results = useMemo(() => (network ? searchPlaces(network, query) : []), [network, query])
  const choose = (place: Place) => {
    onPick(place)
    setQuery(place.code)
  }
  return (
    <section className="air-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{messages.search.title}</h2>
      <div className="air-search">
        <input
          id={`${id}-input`}
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
        {hasFocus ? (
          <button
            className="air-button air-button-small"
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
        <ul className="air-results" aria-label={messages.search.results}>
          {results.length === 0 ? (
            <li className="air-results-none">{messages.search.none}</li>
          ) : (
            results.map((place) => (
              <li key={place.id}>
                <button className="air-result" type="button" onClick={() => choose(place)}>
                  <strong>{place.code}</strong>
                  <span>
                    {messages.search.result(place.code, place.name, place.city, place.country)}
                  </span>
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
  const {
    network,
    dataset,
    onDataset,
    mode,
    onMode,
    layout,
    onLayout,
    basemap,
    onBasemap,
    grouped,
    onGrouped,
    filters,
    onFilters,
    counts,
    opened,
    mapError,
  } = props
  const id = useId()
  const filtered =
    filters.country !== noFilters.country ||
    filters.airline !== noFilters.airline ||
    filters.minRoutes !== noFilters.minRoutes
  const cap = Math.min(minimumCap, network?.maxRoutes ?? minimumCap)
  return (
    <aside className="air-panel" aria-label={messages.panel}>
      <Search
        network={network}
        onPick={props.onPick}
        onClear={props.onClear}
        hasFocus={props.hasFocus}
      />

      <section className="air-section" aria-labelledby={`${id}-dataset`}>
        <h2 id={`${id}-dataset`}>{messages.dataset.title}</h2>
        <Choice
          name={`${id}-dataset`}
          legend={messages.dataset.title}
          value={dataset}
          options={datasets.map((item) => ({ value: item, label: messages.dataset[item] }))}
          onChange={onDataset}
        />
        {network ? (
          <p className="air-note">
            {messages.dataset.summary(network.places.length, network.flights.length)}
          </p>
        ) : null}
      </section>

      <section className="air-section" aria-labelledby={`${id}-view`}>
        <h2 id={`${id}-view`}>{messages.view.title}</h2>
        <Choice
          name={`${id}-view`}
          legend={messages.view.title}
          value={mode}
          options={modes.map((item) => ({ value: item, label: messages.view[item] }))}
          onChange={onMode}
        />
        {mode === 'classic' ? (
          <label className="air-field">
            <span>{messages.view.layout}</span>
            <select value={layout} onChange={(event) => onLayout(event.target.value as LayoutId)}>
              {layoutIds.map((item) => (
                <option key={item} value={item}>
                  {messages.view.layouts[item]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="air-field">
            <span>{messages.view.basemap}</span>
            <select
              value={basemap.id}
              onChange={(event) => {
                const next = basemaps.find((item) => item.id === event.target.value)
                if (next) onBasemap(next)
              }}
            >
              {basemaps.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="air-check">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => onGrouped(event.target.checked)}
          />
          <span>{messages.view.group}</span>
        </label>
        <p className="air-note">{messages.view.groupHint(areaRadius)}</p>
      </section>

      <section className="air-section" aria-labelledby={`${id}-filters`}>
        <h2 id={`${id}-filters`}>{messages.filters.title}</h2>
        <label className="air-field">
          <span>{messages.filters.country}</span>
          <select
            value={filters.country}
            disabled={!network}
            onChange={(event) => onFilters({ ...filters, country: event.target.value })}
          >
            <option value="">{messages.filters.anyCountry}</option>
            {network?.countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>
        <label className="air-field">
          <span>{messages.filters.airline}</span>
          <select
            value={filters.airline}
            disabled={!network}
            onChange={(event) => onFilters({ ...filters, airline: event.target.value })}
          >
            <option value="">{messages.filters.anyAirline}</option>
            {network?.carriers.slice(0, 120).map((carrier) => (
              <option key={carrier.key} value={carrier.key}>
                {messages.filters.airlineOption(carrier.name, carrier.count)}
              </option>
            ))}
          </select>
        </label>
        <label className="air-field">
          <span>
            {messages.filters.minRoutes}
            <output>{messages.filters.minRoutesValue(filters.minRoutes)}</output>
          </span>
          <input
            type="range"
            min={0}
            max={cap}
            step={1}
            value={Math.min(filters.minRoutes, cap)}
            disabled={!network}
            onChange={(event) => onFilters({ ...filters, minRoutes: Number(event.target.value) })}
          />
        </label>
        <button
          className="air-button air-button-small"
          type="button"
          disabled={!filtered}
          onClick={() => onFilters(noFilters)}
        >
          {messages.filters.reset}
        </button>
      </section>

      <section className="air-section air-foot">
        {counts ? (
          <p className="air-note" role="status">
            {messages.status.shown(counts.airports, counts.routes)}
            {opened > 0 ? ` ${messages.status.revealed(opened)}` : ''}
          </p>
        ) : null}
        <p className="air-note">{messages.status.hint}</p>
        {mode === 'map' && mapError ? <p className="air-error">{mapError}</p> : null}
        <p className="air-credit">
          {dataAttribution.before}
          <a href={dataAttribution.url}>{dataAttribution.name}</a>
          {', '}
          <a href={dataAttribution.licenseUrl}>{dataAttribution.licenseText}</a>
        </p>
        {mode === 'map' ? (
          <p className="air-credit">
            {messages.map.attribution}:{' '}
            {basemap.credit.map((item, index) => (
              <span key={item.url}>
                {index > 0 ? ', ' : ''}
                <a href={item.url}>{item.text}</a>
              </span>
            ))}
          </p>
        ) : null}
      </section>
    </aside>
  )
}
