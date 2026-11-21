import { createFileRoute, notFound } from '@tanstack/react-router'
import type { Node } from 'fumadocs-core/page-tree'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/notebook/page'
import { type JSX, Suspense, use } from 'react'
import { mdxComponents } from '../../components/mdx'
import { markdownType, pageForMarkdown, pageMarkdown } from '../../lib/agent-files'
import { baseOptions } from '../../lib/layout'
import { previewImage, trimmed } from '../../lib/og'
import { absoluteUrl } from '../../lib/origin'
import { articleData, type Crumb, pageHead } from '../../lib/seo'
import { docs, source } from '../../lib/source'
import { messages } from '../../messages'
import { editUrl } from '../../site'

function trailOf(nodes: readonly Node[], url: string): Crumb[] | null {
  for (const node of nodes) {
    if (node.type === 'page') {
      if (node.url === url && typeof node.name === 'string') {
        return [{ name: node.name, url: absoluteUrl(`${trimmed(node.url)}/`) }]
      }
    } else if (node.type === 'folder') {
      const inner = trailOf(node.children, url)
      if (!inner) continue
      const first = node.children.find((child) => child.type === 'page')
      const target = node.index?.url ?? (first?.type === 'page' ? first.url : undefined)
      const own =
        typeof node.name === 'string' && target
          ? [{ name: node.name, url: absoluteUrl(`${trimmed(target)}/`) }]
          : []
      return [...own, ...inner]
    }
  }
  return null
}

function crumbsOf(url: string): Crumb[] {
  const trail = trailOf(source.getPageTree().children, url) ?? []
  const crumbs = [{ name: messages.seo.home, url: absoluteUrl('') }, ...trail]
  return crumbs.filter((crumb, index) => crumbs[index + 1]?.url !== crumb.url)
}

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
      url: page.url,
      title: page.data.title ?? '',
      description: page.data.description ?? '',
      crumbs: crumbsOf(page.url),
    }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {}
    const title = messages.pageTitle(
      loaderData.title,
      loaderData.url.startsWith('/docs/api/') ? messages.nav.api : undefined,
    )
    const seo = {
      path: loaderData.url,
      title,
      description: loaderData.description,
      type: 'article',
      image: previewImage(loaderData.url, false),
    } as const
    const head = pageHead({
      ...seo,
      data: [articleData({ ...seo, title: loaderData.title }, loaderData.crumbs)],
    })
    return {
      meta: head.meta,
      links: [
        ...head.links,
        {
          rel: 'alternate',
          type: 'text/markdown',
          href: `${import.meta.env.BASE_URL}docs/${params._splat ? `${params._splat.replace(/\/+$/, '')}.md` : 'index.md'}`,
        },
      ],
    }
  },
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
