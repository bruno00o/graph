import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

interface RelayOptions {
  readonly root: string
  readonly timeout?: number | undefined
  readonly pageWait?: number | undefined
}

interface Tab {
  readonly id: string
  readonly response: ServerResponse
  readonly connectedAt: number
  url: string
  title: string
  visible: boolean
  focused: boolean
  graphs: number
}

interface Reply {
  readonly ok: boolean
  readonly result?: unknown
  readonly error?: string
  readonly candidates?: unknown
}

interface Pending {
  readonly tab: string
  readonly done: (reply: Reply) => void
  readonly timer: ReturnType<typeof setTimeout>
}

interface PageInfo {
  readonly url?: unknown
  readonly title?: unknown
  readonly visible?: unknown
  readonly focused?: unknown
  readonly graphs?: unknown
}

interface ReplyBody extends Reply {
  readonly id?: unknown
  readonly tab?: unknown
  readonly page?: PageInfo
}

class Refusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const relayRoutes: readonly string[] = [
  'graphs',
  'snapshot',
  'query',
  'act',
  'image',
  'errors',
  'changes',
]

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const localNames = new Set(['localhost', '127.0.0.1', '::1'])
const bodyLimit = 1 << 20

function hostName(host: string | undefined): string | null {
  if (!host) return null
  const match = /^\[([^\]]+)\](?::\d+)?$/.exec(host) ?? /^([^:]+)(?::\d+)?$/.exec(host)
  return match?.[1]?.toLowerCase() ?? null
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) return
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > bodyLimit) throw new Refusal(413, 'the request body is larger than 1 MB')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Refusal(400, 'the request body must be a JSON object')
    }
    return body as Record<string, unknown>
  } catch (error) {
    if (error instanceof Refusal) throw error
    throw new Refusal(400, 'the request body is not JSON')
  }
}

function check(request: IncomingMessage, route: string): void {
  const remote = request.socket.remoteAddress
  if (!remote || !loopback.has(remote)) {
    throw new Refusal(403, 'the graph agent relay only answers this machine')
  }
  const host = request.headers.host
  const name = hostName(host)
  if (name === null || !localNames.has(name)) {
    throw new Refusal(403, 'the graph agent relay only answers localhost')
  }
  const origin = request.headers.origin
  if (origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`) {
    throw new Refusal(403, 'the graph agent relay refuses other origins')
  }
  if (route === 'events') {
    const site = request.headers['sec-fetch-site']
    if (site !== undefined && site !== 'same-origin') {
      throw new Refusal(403, 'the graph agent relay refuses other sites')
    }
    return
  }
  if (request.headers['x-graph-agent'] === undefined) {
    throw new Refusal(403, 'the graph agent relay requires the X-Graph-Agent header')
  }
}

interface Relay {
  handle(request: IncomingMessage, response: ServerResponse): void
  listening(address: AddressInfo | string | null): void
  close(): void
}

function createRelay(options: RelayOptions): Relay {
  const timeout = options.timeout ?? 30_000
  const pageWait = options.pageWait ?? 5000
  const folder = join(options.root, '.graph-agent')
  const tabs = new Map<string, Tab>()
  const pending = new Map<string, Pending>()
  const waiters = new Set<() => void>()
  const pings = new Map<string, ReturnType<typeof setInterval>>()
  let written = false

  const prepare = () => {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, '.gitignore'), '*\n')
  }

  const choose = (): Tab | undefined => {
    let best: Tab | undefined
    let bestRank = -1
    for (const tab of tabs.values()) {
      const rank = (tab.visible ? 2 : 0) + (tab.focused ? 1 : 0)
      if (rank > bestRank || (rank === bestRank && best && tab.connectedAt > best.connectedAt)) {
        best = tab
        bestRank = rank
      }
    }
    return best
  }

  const tabFor = async (wanted: string | null): Promise<Tab> => {
    const deadline = Date.now() + pageWait
    for (;;) {
      if (wanted) {
        const tab = tabs.get(wanted)
        if (tab) return tab
        if (tabs.size > 0) {
          throw new Refusal(404, `unknown tab ${wanted}; run "graph-agent tabs" to list them`)
        }
      } else {
        const tab = choose()
        if (tab) return tab
      }
      const left = deadline - Date.now()
      if (left <= 0) {
        throw new Refusal(
          503,
          'no page is connected: open a page of the app that shows a graph, or wait for it to reload',
        )
      }
      await new Promise<void>((done) => {
        const wake = () => {
          waiters.delete(wake)
          clearTimeout(timer)
          done()
        }
        const timer = setTimeout(wake, left)
        waiters.add(wake)
      })
    }
  }

  const command = (tab: Tab, route: string, body: Record<string, unknown>): Promise<Reply> => {
    const id = randomUUID()
    const asked: { readonly timeout?: unknown } = body
    const extra = typeof asked.timeout === 'number' ? asked.timeout : 0
    const wait = timeout + Math.max(0, Math.min(extra, 600_000))
    return new Promise((done) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        done({ ok: false, error: `the page did not answer within ${wait} ms` })
      }, wait)
      pending.set(id, { tab: tab.id, done, timer })
      tab.response.write(`event: command\ndata: ${JSON.stringify({ id, route, body })}\n\n`)
    })
  }

  const learn = (tab: Tab | undefined, page: PageInfo | undefined) => {
    if (!tab || !page) return
    if (typeof page.url === 'string') tab.url = page.url
    if (typeof page.title === 'string') tab.title = page.title
    if (typeof page.visible === 'boolean') tab.visible = page.visible
    if (typeof page.focused === 'boolean') tab.focused = page.focused
    if (typeof page.graphs === 'number') tab.graphs = page.graphs
  }

  const closeTab = (id: string) => {
    tabs.delete(id)
    const ping = pings.get(id)
    if (ping) clearInterval(ping)
    pings.delete(id)
    for (const [key, wait] of pending) {
      if (wait.tab !== id) continue
      clearTimeout(wait.timer)
      pending.delete(key)
      wait.done({ ok: false, error: 'the page closed or reloaded before answering' })
    }
  }

  const events = (request: IncomingMessage, response: ServerResponse, url: URL) => {
    const id = url.searchParams.get('tab') || randomUUID()
    const previous = tabs.get(id)
    if (previous) {
      closeTab(id)
      previous.response.end()
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    response.write(': connected\n\n')
    tabs.set(id, {
      id,
      response,
      connectedAt: Date.now(),
      url: url.searchParams.get('url') ?? '',
      title: url.searchParams.get('title') ?? '',
      visible: true,
      focused: false,
      graphs: 0,
    })
    pings.set(
      id,
      setInterval(() => response.write(': ping\n\n'), 15_000),
    )
    for (const wake of [...waiters]) wake()
    request.on('close', () => {
      if (tabs.get(id)?.response === response) closeTab(id)
    })
  }

  const forward = async (
    request: IncomingMessage,
    response: ServerResponse,
    route: string,
    url: URL,
  ) => {
    const started = performance.now()
    const body = request.method === 'POST' ? await readBody(request) : {}
    for (const [name, value] of url.searchParams) {
      if (name !== 'tab' && !(name in body)) body[name] = value
    }
    const tab = await tabFor(url.searchParams.get('tab'))
    const reply = await command(tab, route, body)
    const relayMs = Math.round((performance.now() - started) * 100) / 100
    const where = { tab: tab.id, url: tab.url }
    if (!reply.ok) {
      send(response, 409, {
        error: reply.error ?? 'the page failed',
        ...(reply.candidates !== undefined ? { candidates: reply.candidates } : {}),
        ...where,
        relayMs,
      })
      return
    }
    const result = (reply.result ?? {}) as {
      readonly base64?: unknown
      readonly [name: string]: unknown
    }
    if (route === 'image' && typeof result.base64 === 'string') {
      const { base64, ...rest } = result
      prepare()
      const path = join(folder, `graph-${new Date().toISOString().replace(/[:.]/g, '-')}.png`)
      writeFileSync(path, Buffer.from(base64 as string, 'base64'))
      send(response, 200, { path, ...rest, ...where, relayMs })
      return
    }
    send(response, 200, { ...where, relayMs, ...result })
  }

  const route = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const name = url.pathname.slice('/__graph/'.length)
    check(request, name)
    if (name === 'events' && request.method === 'GET') {
      events(request, response, url)
      return
    }
    if (name === 'reply' && request.method === 'POST') {
      const body: ReplyBody = { ok: false, ...(await readBody(request)) }
      learn(typeof body.tab === 'string' ? tabs.get(body.tab) : undefined, body.page)
      const wait = typeof body.id === 'string' ? pending.get(body.id) : undefined
      if (wait) {
        clearTimeout(wait.timer)
        pending.delete(body.id as string)
        wait.done(body)
      }
      send(response, 200, { ok: true })
      return
    }
    if (name === 'page' && request.method === 'POST') {
      const body = (await readBody(request)) as PageInfo & { tab?: unknown }
      learn(typeof body.tab === 'string' ? tabs.get(body.tab) : undefined, body)
      send(response, 200, { ok: true })
      return
    }
    if (name === 'tabs') {
      if (tabs.size === 0) await tabFor(null).catch(() => undefined)
      const chosen = choose()
      send(response, 200, {
        tabs: [...tabs.values()].map((tab) => ({
          tab: tab.id,
          url: tab.url,
          title: tab.title,
          visible: tab.visible,
          focused: tab.focused,
          graphs: tab.graphs,
          connectedAt: tab.connectedAt,
          chosen: tab === chosen,
        })),
      })
      return
    }
    if (relayRoutes.includes(name)) {
      await forward(request, response, name, url)
      return
    }
    throw new Refusal(404, `unknown route ${name}; routes: tabs, ${relayRoutes.join(', ')}`)
  }

  return {
    handle(request, response) {
      route(request, response).catch((error: unknown) => {
        const status = error instanceof Refusal ? error.status : 500
        send(response, status, { error: error instanceof Error ? error.message : String(error) })
      })
    },
    listening(address) {
      const port = typeof address === 'object' && address !== null ? address.port : null
      if (port === null) return
      prepare()
      writeFileSync(
        join(folder, 'server.json'),
        `${JSON.stringify({ url: `http://localhost:${port}`, pid: process.pid, startedAt: Date.now() }, null, 2)}\n`,
      )
      written = true
    },
    close() {
      for (const id of [...tabs.keys()]) {
        const tab = tabs.get(id)
        closeTab(id)
        tab?.response.end()
      }
      for (const wake of [...waiters]) wake()
      if (written) rmSync(join(folder, 'server.json'), { force: true })
      written = false
    },
  }
}

/**
 * Options of `graphAgent`.
 * @experimental
 */
export interface GraphAgentPluginOptions {
  /**
   * Adds the client of the bridge to the pages that import the library, so that the app imports
   * nothing. `false` leaves it to a line of the app, such as the one a TanStack Start app needs.
   * @default true
   */
  readonly inject?: boolean | undefined
  /**
   * Longest wait for a page to answer a command, in milliseconds, beyond the `timeout` of the
   * command itself.
   * @default 30000
   */
  readonly timeout?: number | undefined
  /**
   * Longest wait for a page to connect before a command fails, in milliseconds: the time for the
   * app to open or reload.
   * @default 5000
   */
  readonly pageWait?: number | undefined
}

const here = dirname(fileURLToPath(import.meta.url))
const extension = existsSync(join(here, 'dev.ts')) ? 'ts' : 'js'
const client = join(here, `dev.${extension}`)
const root = join(here, '..')
const entries = new Set(
  extension === 'ts'
    ? ['index.ts', 'react/index.tsx', 'map/index.ts', 'map/react.tsx', 'headless/index.ts']
    : ['index.js', 'react.js', 'map.js', 'map/react.js', 'headless.js'],
)

function clean(id: string): string {
  return normalize((id.split('?')[0] ?? id).replace(/^\/@fs\//, '/'))
}

function isEntry(id: string): boolean {
  const path = clean(id)
  if (!path.startsWith(root)) return false
  return entries.has(path.slice(root.length + 1).replaceAll('\\', '/'))
}

function injected(code: string): string {
  return `${code}\nimport(${JSON.stringify(client)});\n`
}

function majorOf(version: string | undefined): number {
  const major = Number.parseInt(version ?? '', 10)
  return Number.isFinite(major) ? major : 8
}

/**
 * Vite plugin that lets a coding agent read and drive the graphs of the app in development: it
 * relays the commands of the `graph-agent` command to the open pages, under `/__graph/` on the
 * dev server, and adds the client of the bridge to the pages. It applies to `vite dev` only,
 * never to a build.
 * @experimental
 */
export function graphAgent(options: GraphAgentPluginOptions = {}): Plugin {
  const inject = options.inject !== false
  let relay: ReturnType<typeof createRelay> | null = null
  return {
    name: 'graph-agent',
    apply: 'serve',
    config() {
      if (!inject) return undefined
      if (majorOf(this.meta.viteVersion) >= 8) {
        return {
          optimizeDeps: {
            rolldownOptions: {
              plugins: [
                {
                  name: 'graph-agent-client',
                  transform(code: string, id: string) {
                    return isEntry(id) ? { code: injected(code), map: null } : null
                  },
                },
              ],
            },
          },
        }
      }
      return {
        optimizeDeps: {
          esbuildOptions: {
            plugins: [
              {
                name: 'graph-agent-client',
                setup(build: {
                  onLoad(
                    options: { filter: RegExp },
                    load: (args: { path: string }) => { contents: string; loader: 'js' } | null,
                  ): void
                }) {
                  build.onLoad({ filter: /@bruno00o[\\/]graph[\\/]dist[\\/].*\.js$/ }, (args) =>
                    isEntry(args.path)
                      ? { contents: injected(readFileSync(args.path, 'utf8')), loader: 'js' }
                      : null,
                  )
                },
              },
            ],
          },
        },
      } as never
    },
    configureServer(server) {
      const current = createRelay({
        root: server.config.root,
        ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
        ...(options.pageWait !== undefined ? { pageWait: options.pageWait } : {}),
      })
      relay = current
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/__graph/')) {
          next()
          return
        }
        current.handle(request, response)
      })
      const http = server.httpServer
      if (http) {
        if (http.listening) current.listening(http.address())
        else http.once('listening', () => current.listening(http.address()))
        http.once('close', () => current.close())
      }
    },
    transform: {
      order: 'pre',
      handler(code, id) {
        if (!inject || this.environment.name !== 'client' || !isEntry(id)) return null
        return { code: injected(code), map: null }
      },
    },
    buildEnd() {
      relay?.close()
      relay = null
    },
  }
}
