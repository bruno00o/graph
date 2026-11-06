import Link from 'fumadocs-core/link'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import type { JSX } from 'react'
import { homeOptions } from '../lib/layout'
import { messages } from '../messages'

export function NotFound(): JSX.Element {
  return (
    <HomeLayout {...homeOptions()}>
      <main id="content" className="not-found">
        <h1>{messages.notFound.title}</h1>
        <p>{messages.notFound.lead}</p>
        <p>
          <Link className="ulink" href="/">
            {messages.notFound.home}
          </Link>
        </p>
      </main>
    </HomeLayout>
  )
}
