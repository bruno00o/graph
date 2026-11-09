import { createFileRoute } from '@tanstack/react-router'
import { llmsIndex, textType } from '../lib/agent-files'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: async () => new Response(await llmsIndex(), { headers: { 'content-type': textType } }),
    },
  },
})
