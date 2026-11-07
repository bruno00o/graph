import { createFileRoute, notFound } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { Card, Cards } from 'fumadocs-ui/components/card'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, Suspense, useState } from 'react'
import { ExampleFrame, ExampleSource, toggleFullScreen } from '../../components/example-frame'
import { SiteFooter } from '../../components/footer'
import { Icon } from '../../components/icon'
import { mdxComponents } from '../../components/mdx'
import { categoryOf, findExample, neighborsOf } from '../../examples/catalog'
import { exampleNotes } from '../../examples/notes'
import { sourcesOf } from '../../examples/sources'
import type { Example } from '../../examples/types'
import { homeOptions } from '../../lib/layout'
import { source } from '../../lib/source'
import { messages } from '../../messages'
import { sourceUrl } from '../../site'

interface RelatedPage {
  readonly href: string
  readonly title: string
  readonly kind: 'guide' | 'api'
}

function relatedPage(slug: string, page: string, kind: RelatedPage['kind']): RelatedPage {
  const [path = '', anchor] = page.split('#')
  const found = source.getPage([...(kind === 'api' ? ['api'] : []), ...path.split('/')])
  if (!found) throw new Error(`${slug}: no docs page for "${page}" in ${kind}`)
  return {
    href: anchor ? `${found.url}#${anchor}` : found.url,
    title: found.data.title ?? page,
    kind,
  }
}

export const Route = createFileRoute('/examples/$slug')({
  loader: async ({ params }) => {
    const example = findExample(params.slug)
    if (!example) throw notFound()
    const [sources] = await Promise.all([
      sourcesOf(example),
      exampleNotes.get(`${example.slug}/notes.mdx`)?.preload(),
    ])
    return {
      slug: example.slug,
      title: example.title,
      description: example.description,
      files: sources.files,
      modules: sources.modules,
      related: [
        ...example.guides.map((page) => relatedPage(example.slug, page, 'guide')),
        ...example.api.map((page) => relatedPage(example.slug, page, 'api')),
      ],
    }
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: messages.pageTitle(loaderData.title) },
          { name: 'description', content: loaderData.description },
        ]
      : [],
  }),
  component: ExamplePage,
})

function Pager({ example }: { readonly example: Example }): JSX.Element {
  const { previous, next } = neighborsOf(example)
  return (
    <nav className="pager" aria-label={messages.examples.pager}>
      {previous ? (
        <Link className="pager-previous" href={`/examples/${previous.slug}`}>
          <small>
            <Icon name="back" />
            {messages.examples.previous}
          </small>
          <strong>{previous.title}</strong>
        </Link>
      ) : null}
      {next ? (
        <Link className="pager-next" href={`/examples/${next.slug}`}>
          <small>
            {messages.examples.next}
            <Icon name="arrow" />
          </small>
          <strong>{next.title}</strong>
        </Link>
      ) : null}
    </nav>
  )
}

function Notes({ slug }: { readonly slug: string }): JSX.Element | null {
  const Body = exampleNotes.get(`${slug}/notes.mdx`)?.body
  if (!Body) return null
  return (
    <div className="prose example-notes">
      <Suspense>
        <Body components={mdxComponents()} />
      </Suspense>
    </div>
  )
}

function Related({ pages }: { readonly pages: readonly RelatedPage[] }): JSX.Element | null {
  if (pages.length === 0) return null
  return (
    <section className="example-related" aria-labelledby="example-related">
      <h2 id="example-related">{messages.examples.related}</h2>
      <Cards>
        {pages.map((page) => (
          <Card
            key={page.href}
            href={page.href}
            title={page.title}
            description={page.kind === 'api' ? messages.examples.api : messages.examples.guide}
          />
        ))}
      </Cards>
    </section>
  )
}

function ExampleView({ example }: { readonly example: Example }): JSX.Element {
  const { files, modules, related } = Route.useLoaderData()
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const category = categoryOf(example)
  return (
    <main id="content" className="wrap">
      <div className="example-head">
        <nav className="crumbs" aria-label={messages.examples.breadcrumb}>
          <Link href="/examples">{messages.examples.title}</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/examples#${category.id}`}>{category.title}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{example.title}</span>
        </nav>
        <div className="example-title-row">
          <div>
            <h1>{example.title}</h1>
            <p className="lead">{example.description}</p>
            <ul className="tags">
              {[...example.tags, ...modules.filter((module) => module.includes('/graph/'))].map(
                (item) => (
                  <li className="tag" key={item}>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="actions">
            <a
              className="btn btn-line"
              href={sourceUrl(`docs/src/examples/${example.slug}/${example.entry}`)}
            >
              {messages.examples.sourceOnGithub}
              <Icon name="external" />
            </a>
            <button className="btn btn-ink" type="button" onClick={() => toggleFullScreen(frame)}>
              {messages.examples.openFullScreen}
            </button>
          </div>
        </div>
      </div>
      <div className="example-body">
        <div className="example-main">
          <ExampleFrame example={example} frame={frame} onFrame={setFrame} />
          <Notes slug={example.slug} />
          <Related pages={related} />
        </div>
        <div className="example-code">
          <ExampleSource files={files} />
        </div>
      </div>
      <Pager example={example} />
    </main>
  )
}

function ExamplePage(): JSX.Element {
  const { slug } = Route.useLoaderData()
  const example = findExample(slug)
  return (
    <HomeLayout {...homeOptions()}>
      {example ? <ExampleView key={example.slug} example={example} /> : null}
      <SiteFooter />
    </HomeLayout>
  )
}
