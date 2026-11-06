import { createFileRoute, notFound } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, useState } from 'react'
import { ExampleFrame, ExampleSource, toggleFullScreen } from '../../components/example-frame'
import { SiteFooter } from '../../components/footer'
import { Icon } from '../../components/icon'
import { mdxComponents } from '../../components/mdx'
import { type ExampleEntry, examples, findExample } from '../../examples/registry'
import { sourcesOf } from '../../examples/sources'
import { homeOptions } from '../../lib/layout'
import { exampleNotes } from '../../lib/notes'
import { messages } from '../../messages'
import { sourceUrl } from '../../site'

export const Route = createFileRoute('/examples/$slug')({
  loader: ({ params }) => {
    const example = findExample(params.slug)
    if (!example) throw notFound()
    return { title: example.title, description: example.description }
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

function Pager({ example }: { readonly example: ExampleEntry }): JSX.Element {
  const index = examples.indexOf(example)
  const previous = examples[index - 1]
  const next = examples[index + 1]
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

function Example({ example }: { readonly example: ExampleEntry }): JSX.Element {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const Notes = exampleNotes.get(`${example.slug}.mdx`)?.body
  const main = example.files[0] ?? ''
  return (
    <main id="content" className="wrap">
      <div className="example-head">
        <nav className="crumbs" aria-label={messages.examples.breadcrumb}>
          <Link href="/examples">{messages.examples.title}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{example.title}</span>
        </nav>
        <div className="example-title-row">
          <div>
            <h1>{example.title}</h1>
            <p className="lead">{example.description}</p>
            <ul className="tags">
              {[
                ...example.tags,
                ...example.modules.filter((module) => module.includes('/graph/')),
              ].map((item) => (
                <li className="tag" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <a className="btn btn-line" href={sourceUrl(`docs/src/examples/${main}`)}>
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
          {Notes ? (
            <div className="prose example-notes">
              <Notes components={mdxComponents()} />
            </div>
          ) : null}
        </div>
        <div className="example-code">
          <ExampleSource files={sourcesOf(example.files)} />
        </div>
      </div>
      <Pager example={example} />
    </main>
  )
}

function ExamplePage(): JSX.Element | null {
  const { slug } = Route.useParams()
  const example = findExample(slug)
  return (
    <HomeLayout {...homeOptions()}>
      {example ? <Example key={example.slug} example={example} /> : null}
      <SiteFooter />
    </HomeLayout>
  )
}
