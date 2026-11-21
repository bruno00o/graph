import { createFileRoute } from '@tanstack/react-router'
import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { JSX } from 'react'
import { SiteFooter } from '../../components/footer'
import { ThumbnailPair } from '../../components/thumbnail'
import { homeOptions } from '../../lib/layout'
import { previewImage } from '../../lib/og'
import { pageHead } from '../../lib/seo'
import { messages } from '../../messages'
import { showcases } from '../../showcase/catalog'
import type { Showcase } from '../../showcase/types'

export const Route = createFileRoute('/showcase/')({
  head: () =>
    pageHead({
      path: '/showcase',
      title: messages.pageTitle(messages.showcase.title),
      description: messages.showcase.lead,
      image: previewImage('/showcase', false),
    }),
  component: Index,
})

function Card({
  showcase,
  eager,
}: {
  readonly showcase: Showcase
  readonly eager: boolean
}): JSX.Element {
  return (
    <li className="card">
      <div className="thumb sheet">
        {showcase.images ? (
          <ThumbnailPair
            images={showcase.images}
            alt={messages.showcase.preview(showcase.title)}
            eager={eager}
          />
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
            <Card key={showcase.slug} showcase={showcase} eager />
          ))}
        </ul>
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
