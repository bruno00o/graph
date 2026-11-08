import { createFileRoute, notFound } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { Card, Cards } from 'fumadocs-ui/components/card'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { type JSX, useState } from 'react'
import { toggleFullScreen } from '../../components/example-frame'
import { SiteFooter } from '../../components/footer'
import { Icon } from '../../components/icon'
import { ShowcaseFrame } from '../../components/showcase-frame'
import { homeOptions } from '../../lib/layout'
import { source } from '../../lib/source'
import { messages } from '../../messages'
import { findShowcase, problemsOf } from '../../showcase/catalog'
import type { Showcase } from '../../showcase/types'
import { sourceUrl } from '../../site'

interface RelatedPage {
  readonly href: string
  readonly title: string
}

function pageOf(slug: string, page: string, api: boolean): RelatedPage {
  const [path = '', anchor] = page.split('#')
  const found = source.getPage([...(api ? ['api'] : []), ...path.split('/')])
  if (!found) throw new Error(`${slug}: no docs page for "${page}"`)
  return { href: anchor ? `${found.url}#${anchor}` : found.url, title: found.data.title ?? page }
}

export const Route = createFileRoute('/showcase/$slug')({
  loader: ({ params }) => {
    const problems = problemsOf(params.slug)
    if (problems.length > 0) throw new Error(`Invalid showcase:\n${problems.join('\n')}`)
    const showcase = findShowcase(params.slug)
    if (!showcase) throw notFound()
    return {
      slug: showcase.slug,
      title: showcase.title,
      description: showcase.description,
      features: showcase.features.map((feature) => ({
        text: feature.text,
        ...pageOf(showcase.slug, feature.page, false),
      })),
      api: showcase.api.map((page) => pageOf(showcase.slug, page, true)),
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
  component: ShowcasePage,
})

function ShowcaseView({ showcase }: { readonly showcase: Showcase }): JSX.Element {
  const { features, api } = Route.useLoaderData()
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const { source: data } = showcase
  return (
    <main id="content" className="wrap">
      <div className="example-head">
        <nav className="crumbs" aria-label={messages.showcase.breadcrumb}>
          <Link href="/showcase">{messages.showcase.title}</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{showcase.title}</span>
        </nav>
        <div className="example-title-row">
          <div>
            <h1>{showcase.title}</h1>
            <p className="lead">{showcase.description}</p>
            <ul className="tags">
              <li className="tag">{showcase.domain}</li>
              {showcase.tags.map((item) => (
                <li className="tag" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="actions">
            <a className="btn btn-line" href={sourceUrl(`docs/src/showcase/${showcase.slug}`)}>
              {messages.showcase.sourceOnGithub}
              <Icon name="external" />
            </a>
            <button className="btn btn-ink" type="button" onClick={() => toggleFullScreen(frame)}>
              {messages.examples.openFullScreen}
            </button>
          </div>
        </div>
      </div>
      <ShowcaseFrame showcase={showcase} frame={frame} onFrame={setFrame} />
      <div className="showcase-notes prose">
        <h2>{messages.showcase.featuresTitle}</h2>
        <ul>
          {features.map((feature) => (
            <li key={feature.text}>
              {feature.text} <Link href={feature.href}>{feature.title}</Link>
            </li>
          ))}
        </ul>
        <h2>{messages.showcase.dataTitle}</h2>
        <p>
          {messages.showcase.dataText(data.name, data.license)} <a href={data.url}>{data.name}</a>,{' '}
          <a href={data.licenseUrl}>{data.license}</a>.
        </p>
        {data.note ? <p>{data.note}</p> : null}
        <p>
          {messages.showcase.dataBuild} <code>{data.build}</code>.{' '}
          <a href={`${import.meta.env.BASE_URL}showcase-data/${showcase.slug}/LICENSE`}>
            {messages.showcase.dataLicense}
          </a>
        </p>
      </div>
      <section className="example-related" aria-labelledby="showcase-related">
        <h2 id="showcase-related">{messages.examples.related}</h2>
        <Cards>
          {api.map((page) => (
            <Card
              key={page.href}
              href={page.href}
              title={page.title}
              description={messages.showcase.reference}
            />
          ))}
        </Cards>
      </section>
    </main>
  )
}

function ShowcasePage(): JSX.Element {
  const { slug } = Route.useLoaderData()
  const showcase = findShowcase(slug)
  return (
    <HomeLayout {...homeOptions()}>
      {showcase ? <ShowcaseView key={showcase.slug} showcase={showcase} /> : null}
      <SiteFooter />
    </HomeLayout>
  )
}
