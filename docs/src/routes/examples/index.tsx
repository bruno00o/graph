import { createFileRoute } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, useState } from 'react'
import { ExamplePreview } from '../../components/example-preview'
import { SiteFooter } from '../../components/footer'
import { type ExampleTag, examples, exampleTags } from '../../examples/registry'
import { homeOptions } from '../../lib/layout'
import { messages } from '../../messages'

export const Route = createFileRoute('/examples/')({
  head: () => ({
    meta: [
      { title: messages.pageTitle(messages.examples.title) },
      { name: 'description', content: messages.examples.lead },
    ],
  }),
  component: Gallery,
})

function Gallery(): JSX.Element {
  const [tag, setTag] = useState<ExampleTag | null>(null)
  const shown = tag ? examples.filter((example) => example.tags.includes(tag)) : examples
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="wrap">
        <div className="page-head">
          <h1>{messages.examples.title}</h1>
          <p className="lead">{messages.examples.lead}</p>
          <fieldset className="chips">
            <legend className="sr-only">{messages.examples.filters}</legend>
            <button
              className="chip"
              type="button"
              aria-pressed={tag === null}
              onClick={() => setTag(null)}
            >
              {messages.examples.all}
              <span className="chip-count">{examples.length}</span>
            </button>
            {exampleTags.map((item) => (
              <button
                className="chip"
                type="button"
                key={item}
                aria-pressed={tag === item}
                onClick={() => setTag(item)}
              >
                {item}
                <span className="chip-count">
                  {examples.filter((example) => example.tags.includes(item)).length}
                </span>
              </button>
            ))}
          </fieldset>
        </div>
        <ul className="gallery">
          {shown.map((example) => (
            <li className="card" key={example.slug}>
              <ExamplePreview example={example} />
              <div className="card-body">
                <h2>
                  <Link href={`/examples/${example.slug}`}>{example.title}</Link>
                </h2>
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
          ))}
        </ul>
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
