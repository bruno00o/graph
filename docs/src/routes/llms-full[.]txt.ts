import { createFileRoute } from '@tanstack/react-router'
import { llmsFull, textType } from '../lib/agent-files'

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => new Response(await llmsFull(), { headers: { 'content-type': textType } }),
    },
  },
})
