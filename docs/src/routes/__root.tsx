import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { RootProvider } from 'fumadocs-ui/provider/tanstack'
import type { JSX, ReactNode } from 'react'
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
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: Shell,
  component: Root,
  notFoundComponent: NotFound,
})

function Shell({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Root(): JSX.Element {
  return (
    <RootProvider search={{ SearchDialog: StaticSearchDialog }}>
      <Outlet />
    </RootProvider>
  )
}
