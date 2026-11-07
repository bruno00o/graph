import { createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, useEffect, useId, useState } from 'react'
import { SiteFooter } from '../../components/footer'
import { Icon } from '../../components/icon'
import { examples } from '../../examples/catalog'
import { type CategoryId, categories } from '../../examples/categories'
import { type Example, type ExampleTag, exampleTags } from '../../examples/types'
import { homeOptions } from '../../lib/layout'
import { messages } from '../../messages'

interface GallerySearch {
  readonly category?: CategoryId
  readonly tag?: ExampleTag
  readonly q?: string
}

const noFilters: GallerySearch = {}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function readSearch(search: Record<string, unknown>): GallerySearch {
  const { category: categoryId, tag: tagName, q: query } = search
  const category = categories.find((item) => item.id === text(categoryId))?.id
  const tag = exampleTags.find((item) => item === text(tagName))
  const q = text(query).trim()
  return {
    ...(category ? { category } : {}),
    ...(tag ? { tag } : {}),
    ...(q ? { q } : {}),
  }
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

const haystacks = new Map(
  examples.map((example) => [example, fold(`${example.title} ${example.description}`)]),
)

function matches(example: Example, filters: GallerySearch): boolean {
  if (filters.category && example.category !== filters.category) return false
  if (filters.tag && !example.tags.includes(filters.tag)) return false
  const words = fold(filters.q ?? '')
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const haystack = haystacks.get(example) ?? ''
  return words.every((word) => haystack.includes(word))
}

export const Route = createFileRoute('/examples/')({
  validateSearch: readSearch,
  head: () => ({
    meta: [
      { title: messages.pageTitle(messages.examples.title) },
      { name: 'description', content: messages.examples.lead },
    ],
  }),
  component: Gallery,
})

function Card({ example }: { readonly example: Example }): JSX.Element {
  const alt = messages.examples.preview(example.title)
  return (
    <li className="card">
      <div className="thumb sheet">
        {example.images ? (
          <>
            <img
              className="thumb-light"
              src={example.images.light}
              alt={alt}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
            />
            <img
              className="thumb-dark"
              src={example.images.dark}
              alt={alt}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
            />
          </>
        ) : null}
      </div>
      <div className="card-body">
        <h3>
          <Link href={`/examples/${example.slug}`}>{example.title}</Link>
        </h3>
        <p>{example.description}</p>
        <ul className="tags">
          {example.tags.map((item) => (
            <li className="tag" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function Chip({
  label,
  count,
  pressed,
  onPress,
}: {
  readonly label: string
  readonly count: number
  readonly pressed: boolean
  readonly onPress: () => void
}): JSX.Element {
  return (
    <button className="chip" type="button" aria-pressed={pressed} onClick={onPress}>
      {label}
      <span className="chip-count">{count}</span>
    </button>
  )
}

function Gallery(): JSX.Element {
  const search = Route.useSearch()
  const hydrated = useHydrated()
  const navigate = useNavigate({ from: Route.fullPath })
  const filters = hydrated ? search : noFilters
  const [query, setQuery] = useState(search.q ?? '')
  const searchId = useId()
  useEffect(() => {
    setQuery((current) => (current.trim() === (search.q ?? '') ? current : (search.q ?? '')))
  }, [search.q])
  const update = (next: GallerySearch) =>
    void navigate({ search: readSearch({ ...next }), replace: true, resetScroll: false })
  const without = (key: keyof GallerySearch): GallerySearch =>
    readSearch({ ...filters, [key]: undefined })
  const shown = examples.filter((example) => matches(example, filters))
  const sections = categories
    .map((category) => ({
      category,
      items: shown.filter((example) => example.category === category.id),
    }))
    .filter((section) => section.items.length > 0)
  const filtered = Object.keys(filters).length > 0
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="wrap">
        <div className="page-head">
          <h1>{messages.examples.title}</h1>
          <p className="lead">{messages.examples.lead}</p>
        </div>
        <search className="gallery-filters">
          <div className="gallery-search">
            <label className="sr-only" htmlFor={searchId}>
              {messages.examples.search}
            </label>
            <Icon name="search" />
            <input
              id={searchId}
              type="search"
              value={hydrated ? query : ''}
              placeholder={messages.examples.searchPlaceholder}
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value)
                update({ ...filters, q: event.target.value })
              }}
            />
          </div>
          <fieldset className="chips">
            <legend className="chips-label">{messages.examples.categories}</legend>
            <Chip
              label={messages.examples.all}
              count={examples.filter((example) => matches(example, without('category'))).length}
              pressed={!filters.category}
              onPress={() => update(without('category'))}
            />
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.title}
                count={
                  examples.filter((example) =>
                    matches(example, { ...without('category'), category: category.id }),
                  ).length
                }
                pressed={filters.category === category.id}
                onPress={() =>
                  update(
                    filters.category === category.id
                      ? without('category')
                      : { ...filters, category: category.id },
                  )
                }
              />
            ))}
          </fieldset>
          <fieldset className="chips">
            <legend className="chips-label">{messages.examples.tags}</legend>
            {exampleTags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                count={
                  examples.filter((example) => matches(example, { ...without('tag'), tag })).length
                }
                pressed={filters.tag === tag}
                onPress={() => update(filters.tag === tag ? without('tag') : { ...filters, tag })}
              />
            ))}
          </fieldset>
          <p className="gallery-count" role="status">
            {messages.examples.results(shown.length, examples.length)}
          </p>
        </search>
        {sections.map(({ category, items }) => (
          <section className="gallery-section" key={category.id} aria-labelledby={category.id}>
            <div className="gallery-section-head">
              <h2 id={category.id}>{category.title}</h2>
              <p>{category.description}</p>
            </div>
            <ul className="gallery">
              {items.map((example) => (
                <Card key={example.slug} example={example} />
              ))}
            </ul>
          </section>
        ))}
        {sections.length === 0 ? (
          <div className="gallery-empty">
            <p>{messages.examples.none}</p>
            {filtered ? (
              <button
                className="btn btn-line"
                type="button"
                onClick={() => {
                  setQuery('')
                  update(noFilters)
                }}
              >
                {messages.examples.clear}
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
