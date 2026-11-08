import { createFileRoute } from '@tanstack/react-router'
import { NotFound } from '../components/not-found'
import { messages } from '../messages'

export const Route = createFileRoute('/not-found')({
  head: () => ({
    meta: [
      { title: messages.pageTitle(messages.notFound.title) },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: NotFound,
})
