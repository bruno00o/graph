import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, createServer, type Rolldown } from 'vite'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const startLine =
  "if (import.meta.env.DEV && !import.meta.env.SSR) import('@bruno00o/graph/agent/dev')"

const folder = mkdtempSync(join(tmpdir(), 'graph-agent-line-'))
writeFileSync(join(folder, 'client.ts'), `${startLine}\nexport const ready = true\n`)

const client = join(import.meta.dirname, 'dev.ts')
const alias = { '@bruno00o/graph/agent/dev': client }

async function bundled(): Promise<string> {
  const output = (await build({
    root: folder,
    logLevel: 'silent',
    configFile: false,
    resolve: { alias },
    build: { write: false, minify: false, lib: { entry: 'client.ts', formats: ['es'] } },
  })) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
  const outputs = Array.isArray(output) ? output : [output]
  return outputs
    .flatMap((each) => each.output)
    .map((chunk) => (chunk.type === 'chunk' ? chunk.code : ''))
    .join('\n')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('../dev')
  vi.resetModules()
})

afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('the dev client of the agent bridge', () => {
  it('does nothing without a window', async () => {
    const created = vi.fn()
    vi.stubGlobal('EventSource', created)
    await import('./dev')
    expect(created).not.toHaveBeenCalled()
  })

  it('warns and does nothing outside development', async () => {
    vi.doMock('../dev', () => ({ dev: false }))
    const created = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('window', {})
    vi.stubGlobal('EventSource', created)
    await import('./dev')
    expect(created).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/only runs in development/))
  })

  it('is loaded by the line of a TanStack Start client in development only', async () => {
    const server = await createServer({
      root: folder,
      logLevel: 'silent',
      configFile: false,
      resolve: { alias },
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
    })
    try {
      const browser = await server.environments.client.transformRequest('/client.ts')
      expect(browser?.code).toMatch(/"DEV": true.*"SSR": false/s)
      expect(browser?.code).toContain('agent/dev.ts')
      const rendered = await server.environments.ssr.transformRequest('/client.ts')
      expect(rendered?.code).toMatch(/"DEV": true.*"SSR": true/s)
      await expect(server.ssrLoadModule('/client.ts')).resolves.toMatchObject({ ready: true })
    } finally {
      await server.close()
    }
    expect(await bundled()).not.toContain('__graph')
  }, 30_000)
})
