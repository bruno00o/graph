import { createFileRoute } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { JSX } from 'react'
import { SiteFooter } from '../../components/footer'
import { homeOptions } from '../../lib/layout'
import { messages } from '../../messages'
import { showcases } from '../../showcase/catalog'
import type { Showcase } from '../../showcase/types'

export const Route = createFileRoute('/showcase/')({
  head: () => ({
    meta: [
      { title: messages.pageTitle(messages.showcase.title) },
      { name: 'description', content: messages.showcase.lead },
    ],
  }),
  component: Index,
})

function Card({ showcase }: { readonly showcase: Showcase }): JSX.Element {
  const alt = messages.showcase.preview(showcase.title)
  return (
    <li className="card">
      <div className="thumb sheet">
        {showcase.images ? (
          <>
            <img
              className="thumb-light"
              src={showcase.images.light}
              alt={alt}
              width={640}
              height={400}
              loading="lazy"
              decoding="async"
            />
            <img
              className="thumb-dark"
              src={showcase.images.dark}
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
          <Link href={`/showcase/${showcase.slug}`}>{showcase.title}</Link>
        </h3>
        <p>{showcase.description}</p>
        <ul className="tags">
          <li className="tag">{showcase.domain}</li>
          {showcase.tags.map((item) => (
            <li className="tag" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}

function Index(): JSX.Element {
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="wrap">
        <div className="page-head">
          <h1>{messages.showcase.title}</h1>
          <p className="lead">{messages.showcase.lead}</p>
        </div>
        <ul className="gallery showcase-gallery">
          {showcases.map((showcase) => (
            <Card key={showcase.slug} showcase={showcase} />
          ))}
        </ul>
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
