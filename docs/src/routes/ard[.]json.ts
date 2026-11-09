import { createFileRoute } from '@tanstack/react-router'
import { ardManifest, jsonType } from '../lib/agent-files'

export const Route = createFileRoute('/ard.json')({
  server: {
    handlers: {
      GET: () =>
        new Response(`${JSON.stringify(ardManifest(), null, 2)}\n`, {
          headers: { 'content-type': jsonType },
        }),
    },
  },
})
