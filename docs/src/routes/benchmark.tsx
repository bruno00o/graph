import { createFileRoute, notFound } from '@tanstack/react-router'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { JSX } from 'react'
import { SiteFooter } from '../components/footer'
import { mdxComponents } from '../components/mdx'
import { homeOptions } from '../lib/layout'
import { previewImage } from '../lib/og'
import { pages } from '../lib/pages'
import { pageHead } from '../lib/seo'
import { messages } from '../messages'

const path = 'benchmark.mdx'

export const Route = createFileRoute('/benchmark')({
  loader: () => {
    const page = pages.get(path)
    if (!page) throw notFound()
    return { title: page.title, description: page.description ?? '' }
  },
  head: ({ loaderData }) =>
    loaderData
      ? pageHead({
          path: '/benchmark',
          title: messages.pageTitle(loaderData.title),
          description: loaderData.description,
          image: previewImage('/benchmark', false),
        })
      : {},
  component: Benchmark,
})

function Benchmark(): JSX.Element {
  const page = pages.get(path)
  const Body = page?.body
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="wrap page-narrow">
        <div className="page-head">
          <h1>{page?.title}</h1>
          <p className="lead">{page?.description}</p>
        </div>
        {Body ? (
          <div className="prose bench-prose">
            <Body components={mdxComponents()} />
          </div>
        ) : null}
      </main>
      <SiteFooter />
    </HomeLayout>
  )
}
