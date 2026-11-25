#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { dirname, join } from 'node:path'

const usage = `graph-agent <command> [options]

Commands, with the graphAgent() Vite plugin running and the app open in a browser:
  tabs                          pages connected to the dev server
  graphs                        graphs mounted in the page
  snapshot                      what the graph draws now
      --limit <n>  --no-labels  --no-wait
  query [text]                  elements by label or key, 50 at a time
      --kind node|edge|shape|group  --within view|shown|selection|<state>|<layer>|<group key>
      --near <key>  --depth <n>  --direction both|forward|backward  --from <n>
  act <step> [then <step>]...   steps run in order, e.g. act select n12 then fit selection
      a step is <action> [target...] [name=value...]
      a target is a key, a label, node:<key>, edge:<key>, shape:<key>,
      group:<name>=<value>, selection or all
      --no-wait  --timeout <ms>
  image                         PNG of the graph written to .graph-agent/
      --region view|graph  --ratio <n>
  errors                        last errors of the page
  changes [--since <n>]         changes of the graphs, from people, code and agents

Options of every command:
  --graph <n>   graph of the page (default: the last mounted)
  --tab <id>    page (default: the visible one, then the last connected)
  --url <url>   dev server (default: read from .graph-agent/server.json)
  --pretty      indent the JSON

Output: JSON on stdout. Exit code 0 on success, 1 when the page refuses, 2 without a server.`

const booleans = new Set(['pretty', 'no-labels', 'no-wait', 'help'])

interface Server {
  readonly url: string
  readonly startedAt: number
}

function readServer(file: string): Server | null {
  try {
    const server = JSON.parse(readFileSync(file, 'utf8')) as {
      url?: unknown
      pid?: unknown
      startedAt?: unknown
    }
    if (typeof server.url !== 'string') return null
    if (typeof server.pid === 'number') {
      try {
        process.kill(server.pid, 0)
      } catch (error) {
        if ((error as { code?: string }).code === 'ESRCH') return null
      }
    }
    return { url: server.url, startedAt: Number(server.startedAt) || 0 }
  } catch {
    return null
  }
}

function findServer(): string | null {
  let folder = process.cwd()
  for (;;) {
    const own = join(folder, '.graph-agent', 'server.json')
    if (existsSync(own)) {
      const server = readServer(own)
      if (server) return server.url
    }
    if (folder === process.cwd()) {
      let best: Server | null = null
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue
        }
        const file = join(folder, entry.name, '.graph-agent', 'server.json')
        const server = existsSync(file) ? readServer(file) : null
        if (server && (!best || server.startedAt > best.startedAt)) best = server
      }
      if (best) return best.url
    }
    const up = dirname(folder)
    if (up === folder) return null
    folder = up
  }
}

function parse(argv: readonly string[]): { flags: Map<string, string | true>; words: string[] } {
  const flags = new Map<string, string | true>()
  const words: string[] = []
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at] as string
    if (!arg.startsWith('--')) {
      words.push(arg)
      continue
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s) as [string, string | undefined]
    if (booleans.has(name)) flags.set(name, true)
    else if (inline !== undefined) flags.set(name, inline)
    else {
      const next = argv[at + 1]
      if (next === undefined) throw new Error(`--${name} needs a value`)
      flags.set(name, next)
      at++
    }
  }
  return { flags, words }
}

function value(text: string): unknown {
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null') return null
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text)) return Number(text)
  return text
}

function target(words: readonly string[]): unknown {
  const read = words.map((word) => {
    const group = /^group:([^=]+)=(.*)$/s.exec(word)
    if (group) return { group: { name: group[1], value: value(group[2] ?? '') } }
    const typed = /^(node|edge|shape):(.+)$/s.exec(word)
    if (typed) return { kind: typed[1], key: typed[2] }
    return word
  })
  return read.length === 1 ? read[0] : read
}

function steps(words: readonly string[]): unknown[] {
  const out: unknown[] = []
  let current: string[] = []
  for (const word of [...words, 'then']) {
    if (word !== 'then') {
      current.push(word)
      continue
    }
    const [action, ...rest] = current
    current = []
    if (action === undefined) continue
    const args: Record<string, unknown> = {}
    const targets: string[] = []
    for (const part of rest) {
      const pair = /^([a-zA-Z]+)=(.*)$/s.exec(part)
      if (pair) args[pair[1] as string] = value(pair[2] ?? '')
      else targets.push(part)
    }
    out.push({
      action,
      ...(targets.length > 0 ? { target: target(targets) } : {}),
      ...(Object.keys(args).length > 0 ? { args } : {}),
    })
  }
  return out
}

interface Reply {
  readonly status: number
  readonly text: string
}

function call(base: string, path: string, body?: unknown): Promise<Reply> {
  const url = new URL(path, base)
  const payload = body === undefined ? null : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const sent = request(
      url,
      {
        method: payload === null ? 'GET' : 'POST',
        headers: {
          'x-graph-agent': '1',
          ...(payload === null
            ? {}
            : {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        )
        response.on('error', reject)
      },
    )
    sent.on('error', reject)
    if (payload !== null) sent.write(payload)
    sent.end()
  })
}

function print(body: unknown, pretty: boolean): void {
  process.stdout.write(`${JSON.stringify(body, null, pretty ? 2 : undefined)}\n`)
}

function number(flags: Map<string, string | true>, name: string): number | undefined {
  const text = flags.get(name)
  if (text === undefined || text === true) return undefined
  const read = Number(text)
  if (!Number.isFinite(read)) throw new Error(`--${name} must be a number`)
  return read
}

function bodyOf(command: string, words: readonly string[], flags: Map<string, string | true>) {
  const text = (name: string) => {
    const read = flags.get(name)
    return typeof read === 'string' ? read : undefined
  }
  const own = {
    ...(number(flags, 'graph') !== undefined ? { graph: number(flags, 'graph') } : {}),
  }
  switch (command) {
    case 'tabs':
    case 'graphs':
    case 'errors':
      return undefined
    case 'changes':
      return { ...own, since: number(flags, 'since') ?? Number(words[0] ?? 0) }
    case 'snapshot':
      return {
        ...own,
        ...(number(flags, 'limit') !== undefined ? { limit: number(flags, 'limit') } : {}),
        ...(flags.has('no-labels') ? { labels: false } : {}),
        ...(flags.has('no-wait') ? { wait: false } : {}),
      }
    case 'query': {
      const near = text('near')
      return {
        ...own,
        ...(words.length > 0 ? { text: words.join(' ') } : {}),
        ...(text('kind') !== undefined ? { kind: text('kind') } : {}),
        ...(text('within') !== undefined ? { within: target([text('within') as string]) } : {}),
        ...(near !== undefined ? { near: target([near.replace(/^node:/, '')]) } : {}),
        ...(number(flags, 'depth') !== undefined ? { depth: number(flags, 'depth') } : {}),
        ...(text('direction') !== undefined ? { direction: text('direction') } : {}),
        ...(number(flags, 'from') !== undefined ? { from: number(flags, 'from') } : {}),
      }
    }
    case 'act': {
      const list = steps(words)
      if (list.length === 0) throw new Error('act needs a step, such as: act select n12')
      return {
        ...own,
        steps: list,
        ...(flags.has('no-wait') ? { wait: false } : {}),
        ...(number(flags, 'timeout') !== undefined ? { timeout: number(flags, 'timeout') } : {}),
      }
    }
    case 'image':
      return {
        ...own,
        ...(text('region') !== undefined ? { region: text('region') } : {}),
        ...(number(flags, 'ratio') !== undefined ? { pixelRatio: number(flags, 'ratio') } : {}),
      }
    default:
      throw new Error(`unknown command ${command}`)
  }
}

async function main(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    print({ error: (error as Error).message }, false)
    return 1
  }
  const { flags, words } = parsed
  const [command, ...rest] = words
  if (!command || command === 'help' || flags.has('help')) {
    process.stdout.write(`${usage}\n`)
    return command || flags.has('help') ? 0 : 1
  }
  const pretty = flags.has('pretty')
  let body: unknown
  try {
    body = bodyOf(command, rest, flags)
  } catch (error) {
    print({ error: (error as Error).message, help: 'graph-agent help' }, pretty)
    return 1
  }
  const url = flags.get('url')
  const base = typeof url === 'string' ? url : findServer()
  if (!base) {
    print(
      {
        error:
          'no dev server found: add graphAgent() from @bruno00o/graph/agent/vite to the Vite config and start it, or pass --url',
      },
      pretty,
    )
    return 2
  }
  const tab = flags.get('tab')
  const query = typeof tab === 'string' ? `?${new URLSearchParams({ tab })}` : ''
  let reply: Reply
  try {
    reply = await call(base, `/__graph/${command}${query}`, body)
  } catch (error) {
    print({ error: `cannot reach ${base}: ${(error as Error).message}` }, pretty)
    return 2
  }
  try {
    print(JSON.parse(reply.text), pretty)
  } catch {
    print({ status: reply.status, text: reply.text }, pretty)
  }
  return reply.status === 200 ? 0 : 1
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    print({ error: String(error) }, false)
    process.exitCode = 1
  },
)
