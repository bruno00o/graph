import { dev } from '../dev'
import type { GraphInstance } from '../host/graph-instance'
import { type InspectedGraph, watchGraphs } from '../host/inspect'
import { createGraphAgent } from './agent'
import type { AgentChange, GraphAgent } from './types'

interface Mounted {
  readonly id: number
  readonly entry: InspectedGraph
  readonly agent: GraphAgent
  readonly since: number
}

interface Command {
  readonly id: string
  readonly route: string
  readonly body: Readonly<Record<string, unknown>>
}

interface PageError {
  readonly kind: string
  readonly message: string
  readonly at?: string
  readonly time: number
}

interface Logged extends AgentChange {
  readonly seq: number
  readonly graph: number
}

interface Body {
  readonly graph?: unknown
  readonly limit?: unknown
  readonly labels?: unknown
  readonly wait?: unknown
  readonly since?: unknown
  readonly region?: unknown
  readonly pixelRatio?: unknown
}

interface Client {
  stop(): void
}

const holderKey = Symbol.for('@bruno00o/graph/agent/dev')
const base = '/__graph'
const keptErrors = 20
const keptChanges = 200
const graphWait = 5000

type Holder = { [holderKey]?: Client }

function scalars(datum: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof datum !== 'object' || datum === null) {
    return datum === undefined ? undefined : { value: datum }
  }
  const out: Record<string, unknown> = {}
  let count = 0
  for (const name of Object.keys(datum)) {
    if (count >= 6) break
    if (name.startsWith('$')) continue
    const value = (datum as Readonly<Record<string, unknown>>)[name]
    if (typeof value === 'string') {
      out[name] = value.length > 60 ? `${value.slice(0, 59)}…` : value
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[name] = value
    } else continue
    count++
  }
  return count > 0 ? out : undefined
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  }
  return btoa(binary)
}

function connect(): Client {
  const tab = Math.random().toString(36).slice(2, 10)
  const mounted: Mounted[] = []
  const errors: PageError[] = []
  const changes: Logged[] = []
  const waiting = new Set<() => void>()
  const unsubscribe = new Map<Mounted, () => void>()
  let seq = 0
  let nextId = 0
  let stopped = false

  const keepError = (kind: string, message: string, at?: string) => {
    errors.push({ kind, message, ...(at ? { at } : {}), time: Date.now() })
    if (errors.length > keptErrors) errors.shift()
  }

  const page = () => ({
    url: location.href,
    title: document.title,
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    graphs: mounted.filter((each) => !each.entry.graph.destroyed).length,
  })

  const post = (route: string, body: unknown) =>
    fetch(`${base}/${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-graph-agent': '1' },
      body: JSON.stringify(body),
    }).catch(() => undefined)

  let pageTimer: ReturnType<typeof setTimeout> | null = null
  const tellPage = () => {
    if (stopped || pageTimer !== null) return
    pageTimer = setTimeout(() => {
      pageTimer = null
      if (!stopped) void post('page', { tab, ...page() })
    }, 50)
  }

  const onError = (event: ErrorEvent) => {
    const at = event.filename
      ? `${event.filename.replace(location.origin, '')}:${event.lineno}:${event.colno}`
      : undefined
    keepError('error', event.error === undefined ? event.message : errorText(event.error), at)
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    keepError('unhandledrejection', errorText(event.reason))
  }

  const unwatch = watchGraphs({
    added(entry) {
      const item: Mounted = {
        id: nextId++,
        entry,
        agent: createGraphAgent(entry.graph, { describe: scalars }),
        since: Date.now(),
      }
      mounted.push(item)
      unsubscribe.set(
        item,
        item.agent.subscribe((change) => {
          changes.push({ ...change, seq: ++seq, graph: item.id })
          if (changes.length > keptChanges) changes.shift()
        }),
      )
      for (const wake of [...waiting]) wake()
      tellPage()
    },
    removed(entry) {
      const at = mounted.findIndex((each) => each.entry === entry)
      const item = mounted[at]
      if (!item) return
      unsubscribe.get(item)?.()
      unsubscribe.delete(item)
      item.agent.destroy()
      mounted.splice(at, 1)
      tellPage()
    },
  })

  const live = () => mounted.filter((each) => !each.entry.graph.destroyed)

  const waitForGraph = (): Promise<void> =>
    new Promise((done) => {
      const wake = () => {
        waiting.delete(wake)
        clearTimeout(timer)
        done()
      }
      const timer = setTimeout(wake, graphWait)
      waiting.add(wake)
    })

  const pick = async (graph: unknown): Promise<Mounted> => {
    if (live().length === 0) await waitForGraph()
    const ready = live()
    if (ready.length === 0) {
      throw new Error(
        `the page ${location.pathname} has no graph after ${graphWait} ms: open a page that mounts one`,
      )
    }
    if (graph === undefined || graph === null || graph === '')
      return ready[ready.length - 1] as Mounted
    const found = ready.find((each) => each.id === Number(graph))
    if (!found) {
      throw new Error(
        `unknown graph ${String(graph)}; graphs: ${ready.map((each) => each.id).join(', ')}`,
      )
    }
    return found
  }

  const settled = (entry: Mounted, wait: number) =>
    new Promise<boolean>((done) => {
      const timer = setTimeout(() => done(false), wait)
      entry.entry.graph.settled().then(
        () => {
          clearTimeout(timer)
          done(true)
        },
        () => {
          clearTimeout(timer)
          done(false)
        },
      )
    })

  const limitOf = (body: Body) => (body.limit === undefined ? undefined : Number(body.limit))

  const handle = async (command: Command): Promise<unknown> => {
    const route = command.route
    const body = command.body as Body
    if (route === 'graphs') {
      return {
        graphs: mounted.map((each) => ({
          graph: each.id,
          label: each.entry.label(),
          surface: each.entry.graph.store.state.surface,
          destroyed: each.entry.graph.destroyed,
          nodes: each.entry.graph.count().nodes,
          edges: each.entry.graph.count().edges,
          mountedAt: each.since,
        })),
      }
    }
    if (route === 'errors') return { errors }
    if (route === 'changes') {
      const since = Number(body.since ?? 0)
      return { seq, changes: changes.filter((change) => change.seq > since) }
    }
    const entry = await pick(body.graph)
    const agent = entry.agent
    if (route === 'snapshot') {
      if (body.wait !== false) await settled(entry, Number(body.wait ?? graphWait) || graphWait)
      const limit = limitOf(body)
      const shot = agent.snapshot({
        ...(limit !== undefined ? { limit } : {}),
        ...(body.labels === false ? { labels: false } : {}),
      })
      return { ...shot, graph: { id: entry.id, ...shot.graph }, errors: errors.slice(-5) }
    }
    if (route === 'query') return { graph: entry.id, ...agent.query(command.body as never) }
    if (route === 'act') return { graph: entry.id, ...(await agent.act(command.body as never)) }
    if (route === 'image') {
      const graph = entry.entry.graph as GraphInstance
      if (graph.store.state.surface === 'none')
        throw new Error('this graph draws nothing: no image')
      const { exportPng } = await import('../export')
      const started = performance.now()
      const region = body.region === 'graph' ? 'graph' : 'view'
      const ratio = Number(body.pixelRatio ?? 1)
      const blob = await exportPng(graph, {
        region,
        pixelRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
      })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      return {
        graph: entry.id,
        base64: base64(bytes),
        bytes: bytes.length,
        ms: Math.round(performance.now() - started),
      }
    }
    throw new Error(`unknown route ${route}`)
  }

  const params = new URLSearchParams({ tab, url: location.href, title: document.title })
  const source = new EventSource(`${base}/events?${params}`)
  const onCommand = (event: MessageEvent<string>) => {
    const command = JSON.parse(event.data) as Command
    handle(command).then(
      (result) => post('reply', { id: command.id, tab, page: page(), ok: true, result }),
      (error: unknown) => {
        const candidates = (error as { candidates?: unknown }).candidates
        return post('reply', {
          id: command.id,
          tab,
          page: page(),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ...(candidates !== undefined ? { candidates } : {}),
        })
      },
    )
  }
  source.addEventListener('command', onCommand as EventListener)
  source.addEventListener('open', tellPage)

  const navigation = (globalThis as { navigation?: EventTarget }).navigation
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection)
  addEventListener('popstate', tellPage)
  addEventListener('hashchange', tellPage)
  addEventListener('focus', tellPage)
  addEventListener('blur', tellPage)
  document.addEventListener('visibilitychange', tellPage)
  navigation?.addEventListener('currententrychange', tellPage)

  return {
    stop() {
      stopped = true
      source.close()
      unwatch()
      for (const off of unsubscribe.values()) off()
      for (const item of mounted) item.agent.destroy()
      if (pageTimer !== null) clearTimeout(pageTimer)
      removeEventListener('error', onError)
      removeEventListener('unhandledrejection', onRejection)
      removeEventListener('popstate', tellPage)
      removeEventListener('hashchange', tellPage)
      removeEventListener('focus', tellPage)
      removeEventListener('blur', tellPage)
      document.removeEventListener('visibilitychange', tellPage)
      navigation?.removeEventListener('currententrychange', tellPage)
    },
  }
}

function start(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
  if (!dev) {
    console.warn(
      'graph: the agent client only runs in development; remove its import from production code',
    )
    return
  }
  const holder = globalThis as Holder
  holder[holderKey]?.stop()
  holder[holderKey] = connect()
}

start()
