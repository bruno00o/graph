import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { RootProvider } from 'fumadocs-ui/provider/tanstack'
import { type JSX, type ReactNode, useEffect } from 'react'
import { NotFound } from '../components/not-found'
import StaticSearchDialog from '../components/search-dialog'
import { messages } from '../messages'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: messages.siteTitle },
      { name: 'description', content: messages.siteDescription },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: `${import.meta.env.BASE_URL}favicon.svg`, type: 'image/svg+xml' },
      { rel: 'alternate', href: `${import.meta.env.BASE_URL}llms.txt`, type: 'text/plain' },
      { rel: 'ard', href: `${import.meta.env.BASE_URL}ard.json`, type: 'application/json' },
      { rel: 'ai-catalog', href: `${import.meta.env.BASE_URL}ard.json`, type: 'application/json' },
    ],
  }),
  shellComponent: Shell,
  component: Root,
  notFoundComponent: NotFound,
})

function Shell({ children }: { readonly children: ReactNode }): JSX.Element {
  const staticPage = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === '/not-found'),
  })
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        {children}
        {staticPage ? null : <Scripts />}
      </body>
    </html>
  )
}

function Root(): JSX.Element {
  useEffect(() => {
    if (!('modelContext' in document) && !('modelContext' in navigator)) return
    import('../lib/web-tools').then((tools) => tools.registerWebTools()).catch(() => undefined)
  }, [])
  return (
    <RootProvider search={{ SearchDialog: StaticSearchDialog }}>
      <Outlet />
    </RootProvider>
  )
}
