import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { platform, tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const root = resolve(import.meta.dirname, '..')
export const docsExamplesDirectory = join(root, 'docs/src/examples')
export const docsSite = join(root, 'docs/dist/client')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

export function serve(directory) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    const file = normalize(join(directory, path))
    if (file !== directory && !file.startsWith(directory + sep)) {
      response.writeHead(403).end()
      return
    }
    const candidates = [file, join(file, 'index.html'), `${file}.html`]
    const found = candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    )
    if (!found) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'content-type': types[extname(found)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(readFileSync(found))
  })
  return new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () =>
      done({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    )
  })
}

export function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`)
}

export async function docsExamples() {
  const slugs = readdirSync(docsExamplesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(docsExamplesDirectory, slug, 'meta.ts')))
    .sort()
  const wrong = slugs.flatMap((slug) => {
    const entries = ['main.ts', 'main.tsx'].filter((file) =>
      existsSync(join(docsExamplesDirectory, slug, file)),
    )
    if (entries.length === 1) return []
    return [
      entries.length === 0
        ? `${slug}: missing main.ts or main.tsx`
        : `${slug}: keep main.ts or main.tsx, not both`,
    ]
  })
  if (wrong.length > 0) throw new Error(`Invalid docs examples:\n${wrong.join('\n')}`)
  return Promise.all(
    slugs.map(async (slug) => {
      const url = pathToFileURL(join(docsExamplesDirectory, slug, 'meta.ts'))
      const { default: meta } = await import(url.href)
      return { slug, meta, folder: join(docsExamplesDirectory, slug) }
    }),
  )
}

export function browserArgs(name, software = false) {
  if (name !== 'chromium') return []
  if (software) return ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  if (platform() === 'darwin') return ['--use-angle=metal', '--enable-gpu']
  return ['--enable-unsafe-swiftshader']
}

export function browserEnv(name) {
  if (name !== 'firefox' || platform() !== 'darwin') return process.env
  return { ...process.env, CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), 'graph-firefox-')) }
}

const blankStyle = JSON.stringify({ version: 8, sources: {}, layers: [] })

export function isolate(context) {
  return context.route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    (route) =>
      route.request().url().endsWith('/style.json')
        ? route.fulfill({ contentType: 'application/json', body: blankStyle })
        : route.abort(),
  )
}

export function install() {
  window.__harness = {
    canvas() {
      const graph = window.graph
      const largest = (scope) => {
        let best = null
        let area = 0
        for (const canvas of scope?.querySelectorAll('canvas') ?? []) {
          const rect = canvas.getBoundingClientRect()
          if (rect.width * rect.height > area) {
            best = canvas
            area = rect.width * rect.height
          }
        }
        return best
      }
      return largest(graph.element) ?? largest(graph.element.parentElement)
    },
    ready() {
      const graph = window.graph
      return Boolean(graph?.element?.isConnected && graph.store.get().width > 0)
    },
    async settle(limit) {
      const graph = window.graph
      const wait = (ms) => new Promise((done) => setTimeout(done, ms))
      const deadline = performance.now() + limit
      let version = -1
      let since = performance.now()
      while (performance.now() < deadline) {
        await wait(50)
        const state = graph.store.get()
        const busy = state.layout?.running || state.bundling?.running || state.routing?.running
        if (busy || state.positionsVersion !== version) {
          version = state.positionsVersion
          since = performance.now()
        } else if (performance.now() - since > 400) return true
      }
      return false
    },
    frames(count) {
      return new Promise((done) => {
        const step = (left) => (left === 0 ? done() : requestAnimationFrame(() => step(left - 1)))
        step(count)
      })
    },
    spot() {
      const canvas = window.__harness.canvas()
      const box = canvas.getBoundingClientRect()
      const left = Math.max(box.left, 0)
      const top = Math.max(box.top, 0)
      const right = Math.min(box.right, innerWidth)
      const bottom = Math.min(box.bottom, innerHeight)
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      for (let radius = 0; radius < Math.max(right - left, bottom - top) / 2; radius += 16) {
        for (let angle = 0; angle < 360; angle += radius === 0 ? 360 : 30) {
          const x = Math.round(cx + radius * Math.cos((angle * Math.PI) / 180))
          const y = Math.round(cy + radius * Math.sin((angle * Math.PI) / 180))
          if (document.elementFromPoint(x, y) === canvas) {
            return { x, y, zoom: window.graph.store.get().view.zoom }
          }
        }
      }
      return null
    },
    locate(key) {
      const graph = window.graph
      const host = graph.element.getBoundingClientRect()
      const frame = host.width > 0 ? host : window.__harness.canvas().getBoundingClientRect()
      const position = graph.positions.get(key)
      if (!position) return null
      const center = graph.view.toScreen(position)
      return { x: Math.round(frame.left + center.x), y: Math.round(frame.top + center.y), key }
    },
    find() {
      const graph = window.graph
      const canvas = window.__harness.canvas()
      const host = graph.element.getBoundingClientRect()
      const frame = host.width > 0 ? host : canvas.getBoundingClientRect()
      const picks = (clientX, clientY, key) => {
        if (clientX < 4 || clientY < 4 || clientX > innerWidth - 4 || clientY > innerHeight - 4) {
          return false
        }
        const target = graph.pick({ x: clientX - frame.left, y: clientY - frame.top })
        return (
          target?.kind === 'node' &&
          target.key === key &&
          document.elementFromPoint(clientX, clientY) === canvas
        )
      }
      const step = 8
      const points = []
      for (let y = step / 2; y < frame.height; y += step) {
        for (let x = step / 2; x < frame.width; x += step) points.push([x, y])
      }
      const cx = frame.width / 2
      const cy = frame.height / 2
      points.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy))
      const tried = new Set()
      let loose = null
      for (const [x, y] of points) {
        const target = graph.pick({ x, y })
        if (target?.kind !== 'node' || tried.has(target.key)) continue
        tried.add(target.key)
        const found = window.__harness.locate(target.key)
        if (!found || !picks(found.x, found.y, target.key)) continue
        const { x: clientX, y: clientY } = found
        const around = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]
        if (around.every(([dx, dy]) => picks(clientX + dx, clientY + dy, target.key))) return found
        loose ??= found
        if (tried.size > 400) break
      }
      return loose
    },
  }
}
