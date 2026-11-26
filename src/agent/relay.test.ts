import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ViteDevServer } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { graphAgent } from './vite'

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => void

interface Running {
  readonly base: string
  readonly root: string
  readonly server: Server
  readonly handle: Middleware
}

function relayed(root: string, server: Server, options: { timeout?: number; pageWait?: number }) {
  let handle: Middleware = (_request, _response, next) => next()
  const plugin = graphAgent(options)
  const configure = plugin.configureServer as (server: ViteDevServer) => void
  configure({
    config: { root },
    middlewares: {
      use(middleware: Middleware) {
        handle = middleware
      },
    },
    httpServer: server,
  } as unknown as ViteDevServer)
  return (request: IncomingMessage, response: ServerResponse, next: () => void) =>
    handle(request, response, next)
}

interface Command {
  readonly id: string
  readonly route: string
  readonly body: Record<string, unknown>
}

const running: Running[] = []
const pages: AbortController[] = []

async function start(options: { timeout?: number; pageWait?: number } = {}): Promise<Running> {
  const root = mkdtempSync(join(tmpdir(), 'graph-agent-'))
  const server = createServer()
  const handle = relayed(root, server, {
    timeout: options.timeout ?? 2000,
    pageWait: options.pageWait ?? 100,
  })
  server.on('request', (request, response) =>
    handle(request, response, () => {
      response.statusCode = 404
      response.end()
    }),
  )
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  const started = { base: `http://127.0.0.1:${port}`, root, server, handle }
  running.push(started)
  return started
}

function call(
  base: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = { 'x-graph-agent': '1' },
) {
  return fetch(`${base}/__graph/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function page(
  base: string,
  tab: string,
  answer: (command: Command) => unknown,
  info: Record<string, unknown> = {},
): Promise<AbortController> {
  const controller = new AbortController()
  pages.push(controller)
  const response = await fetch(`${base}/__graph/events?tab=${tab}&url=/${tab}`, {
    signal: controller.signal,
  })
  if (Object.keys(info).length > 0) await call(base, 'page', { tab, ...info })
  const reader = (response.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        let end = buffer.indexOf('\n\n')
        while (end >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          end = buffer.indexOf('\n\n')
          const data = block.split('\n').find((line) => line.startsWith('data: '))
          if (!block.startsWith('event: command') || !data) continue
          const command = JSON.parse(data.slice(6)) as Command
          const result = answer(command)
          if (result === undefined) continue
          await call(base, 'reply', { id: command.id, tab, ok: true, result })
        }
      }
    } catch {
      return
    }
  })()
  return controller
}

function fakeRequest(headers: Record<string, string>, remoteAddress: string, url: string) {
  return { url, method: 'GET', headers, socket: { remoteAddress } } as unknown as IncomingMessage
}

function fakeResponse() {
  const out = { status: 0, body: '' }
  const response = {
    headersSent: false,
    set statusCode(value: number) {
      out.status = value
    },
    setHeader() {},
    end(text: string) {
      out.body = text
    },
  } as unknown as ServerResponse
  return { out, response }
}

afterEach(async () => {
  for (const controller of pages.splice(0)) controller.abort()
  for (const { server, root } of running.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
    rmSync(root, { recursive: true, force: true })
  }
})

describe('the relay of the agent bridge', () => {
  it('writes where it listens, and forgets it once closed', async () => {
    const { root, server } = await start()
    const file = join(root, '.graph-agent', 'server.json')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      url: expect.stringMatching(/^http:\/\/localhost:\d+$/),
    })
    expect(readFileSync(join(root, '.graph-agent', '.gitignore'), 'utf8')).toBe('*\n')
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
    expect(existsSync(file)).toBe(false)
  })

  it('sends a command to the visible page, or to the one asked for', async () => {
    const { base } = await start()
    await page(base, 'hidden', () => ({ from: 'hidden' }), { visible: false, focused: false })
    await page(base, 'shown', () => ({ from: 'shown' }), { visible: true, focused: true })
    const chosen = await (await call(base, 'snapshot')).json()
    expect(chosen).toMatchObject({ tab: 'shown', from: 'shown', url: '/shown' })
    const asked = await (await call(base, 'snapshot?tab=hidden')).json()
    expect(asked).toMatchObject({ tab: 'hidden', from: 'hidden' })
    const tabs = await (await call(base, 'tabs')).json()
    expect(tabs.tabs.map((tab: { tab: string; chosen: boolean }) => [tab.tab, tab.chosen])).toEqual(
      [
        ['hidden', false],
        ['shown', true],
      ],
    )
    const unknown = await call(base, 'snapshot?tab=nope')
    expect(unknown.status).toBe(404)
  })

  it('passes the body and the query to the page', async () => {
    const { base } = await start()
    const seen: Command[] = []
    await page(base, 'a', (command) => {
      seen.push(command)
      return { ok: 1 }
    })
    await call(base, 'act?graph=2', { steps: [{ action: 'select', target: 'n1' }] })
    expect(seen[0]).toMatchObject({
      route: 'act',
      body: { graph: '2', steps: [{ action: 'select', target: 'n1' }] },
    })
  })

  it('tells when no page is open', async () => {
    const { base } = await start({ pageWait: 50 })
    const response = await call(base, 'snapshot')
    expect(response.status).toBe(503)
    expect((await response.json()).error).toMatch(/no page is connected/)
  })

  it('waits a moment for a page to connect', async () => {
    const { base } = await start({ pageWait: 2000 })
    const answer = call(base, 'graphs')
    await new Promise((done) => setTimeout(done, 50))
    await page(base, 'late', () => ({ graphs: [] }))
    expect(await (await answer).json()).toMatchObject({ tab: 'late', graphs: [] })
  })

  it('fails a command when its page reloads before answering', async () => {
    const { base } = await start()
    const controller = await page(base, 'a', () => undefined)
    const answer = call(base, 'snapshot')
    await new Promise((done) => setTimeout(done, 50))
    controller.abort()
    const response = await answer
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/closed or reloaded/)
  })

  it('fails a command the page does not answer in time', async () => {
    const { base } = await start({ timeout: 50 })
    await page(base, 'a', () => undefined)
    const response = await call(base, 'snapshot')
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/did not answer/)
  })

  it('writes images to its folder', async () => {
    const { base, root } = await start()
    const png = Buffer.from([137, 80, 78, 71])
    await page(base, 'a', () => ({ base64: png.toString('base64'), bytes: 4 }))
    const reply = await (await call(base, 'image', { region: 'view' })).json()
    expect(reply.path.startsWith(join(root, '.graph-agent'))).toBe(true)
    expect(readFileSync(reply.path)).toEqual(png)
    expect(reply).not.toHaveProperty('base64')
  })

  it('refuses requests without its header, from other origins or sites', async () => {
    const { base } = await start()
    expect((await call(base, 'tabs', undefined, {})).status).toBe(403)
    expect(
      (await call(base, 'tabs', undefined, { 'x-graph-agent': '1', origin: 'https://example.com' }))
        .status,
    ).toBe(403)
    const events = await fetch(`${base}/__graph/events?tab=x`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(events.status).toBe(403)
    expect((await call(base, 'nothing')).status).toBe(404)
  })

  it('refuses other machines and other host names', async () => {
    const { handle } = await start()
    const next = () => {}
    const far = fakeResponse()
    handle(
      fakeRequest(
        { host: 'localhost:5173', 'x-graph-agent': '1' },
        '192.168.1.20',
        '/__graph/tabs',
      ),
      far.response,
      next,
    )
    const named = fakeResponse()
    handle(
      fakeRequest(
        { host: 'evil.example:5173', 'x-graph-agent': '1' },
        '127.0.0.1',
        '/__graph/tabs',
      ),
      named.response,
      next,
    )
    await new Promise((done) => setTimeout(done, 10))
    expect(far.out.status).toBe(403)
    expect(JSON.parse(far.out.body).error).toMatch(/this machine/)
    expect(named.out.status).toBe(403)
    expect(JSON.parse(named.out.body).error).toMatch(/localhost/)
  })
})
