import { createFileRoute, notFound } from '@tanstack/react-router'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/notebook/page'
import { type JSX, Suspense, use } from 'react'
import { mdxComponents } from '../../components/mdx'
import { markdownType, pageForMarkdown, pageMarkdown } from '../../lib/agent-files'
import { baseOptions } from '../../lib/layout'
import { docs, source } from '../../lib/source'
import { messages } from '../../messages'
import { editUrl } from '../../site'

export const Route = createFileRoute('/docs/$')({
  server: {
    handlers: {
      GET: async ({ params, next }) => {
        const page = pageForMarkdown(params._splat)
        if (!page) return next()
        return new Response(await pageMarkdown(page), { headers: { 'content-type': markdownType } })
      },
    },
  },
  loader: async ({ params }) => {
    const slugs = (params._splat ?? '').split('/').filter((slug) => slug.length > 0)
    const page = source.getPage(slugs)
    if (!page) throw notFound()
    await docs.getPage(page.path)?.preload()
    return {
      path: page.path,
      title: page.data.title ?? '',
      description: page.data.description ?? '',
    }
  },
  head: ({ loaderData, params }) => ({
    meta: loaderData
      ? [
          { title: messages.pageTitle(loaderData.title) },
          { name: 'description', content: loaderData.description },
        ]
      : [],
    links: loaderData
      ? [
          {
            rel: 'alternate',
            type: 'text/markdown',
            href: `${import.meta.env.BASE_URL}docs/${params._splat ? `${params._splat.replace(/\/+$/, '')}.md` : 'index.md'}`,
          },
        ]
      : [],
  }),
  component: Page,
})

function Content({ path }: { readonly path: string }): JSX.Element {
  const page = docs.getPage(path)
  if (!page) throw notFound()
  const { toc } = use(page.load())
  const Body = page.body
  return (
    <DocsPage toc={toc} tableOfContent={{ style: 'clerk' }}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        <Body components={mdxComponents()} />
      </DocsBody>
      <a className="ulink edit-link" href={editUrl(`docs/content/docs/${path}`)}>
        {messages.docs.edit}
      </a>
    </DocsPage>
  )
}

function Page(): JSX.Element {
  const { path } = Route.useLoaderData()
  return (
    <DocsLayout
      {...baseOptions()}
      tree={source.getPageTree()}
      nav={{ ...baseOptions().nav, mode: 'top' }}
      tabMode="navbar"
    >
      <Suspense>
        <Content path={path} />
      </Suspense>
    </DocsLayout>
  )
}
