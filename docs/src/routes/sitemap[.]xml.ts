import { createFileRoute } from '@tanstack/react-router'
import { sitemap, xmlType } from '../lib/agent-files'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => new Response(sitemap(), { headers: { 'content-type': xmlType } }),
    },
  },
})
