import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { platform, tmpdir } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { inflateSync } from 'node:zlib'
import { chromium, firefox, webkit } from 'playwright'

const { values: options } = parseArgs({
  allowNegative: true,
  options: {
    browser: { type: 'string', multiple: true },
    example: { type: 'string', multiple: true },
    build: { type: 'boolean', default: true },
    software: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    workers: { type: 'string', default: '1' },
    out: { type: 'string', default: 'browser-results' },
  },
})

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, options.out)
const workers = Math.max(1, Number(options.workers) || 1)
const viewport = { width: 1280, height: 900 }
const engines = { chromium, firefox, webkit }
const names = (options.browser ?? ['chromium', 'firefox', 'webkit']).flatMap((value) =>
  value.split(','),
)
for (const name of names) {
  if (!(name in engines)) throw new Error(`Unknown browser ${name}: chromium, firefox or webkit`)
}

const examples = join(root, 'dist-examples')
const buildExamples = ['pnpm', ['exec', 'vite', 'build']]
const lowCapsPages = ['vanilla', 'routing', 'ends', 'bundling', 'layout']

function examplePages(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'assets' && entry.name !== 'bench')
    .filter((entry) => existsSync(join(directory, entry.name, 'index.html')))
    .map((entry) => ({ name: entry.name, path: `/${entry.name}/` }))
}

const suites = [
  {
    name: 'examples',
    port: 5501,
    directory: examples,
    build: buildExamples,
    pages: examplePages,
  },
  {
    name: 'low',
    port: 5501,
    directory: examples,
    build: buildExamples,
    pages: (directory) =>
      examplePages(directory)
        .filter((entry) => lowCapsPages.includes(entry.name))
        .map((entry) => ({ ...entry, path: `${entry.path}?caps=low` })),
  },
  {
    name: 'docs',
    port: 5502,
    directory: join(root, 'docs/dist/client'),
    build: ['pnpm', ['docs:build']],
    pages: (directory) =>
      readdirSync(join(directory, 'examples'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name, path: `/examples/${entry.name}` })),
  },
]

const expectations = {
  'examples/explore': { select: false },
  'examples/filter': { select: false },
  'docs/neighborhood-exploration': { select: false },
  'docs/filter-at-scale': { select: false },
}

const allowedErrors = []

const expectedSkips = []

function matches(id, filters) {
  if (!filters) return true
  const name = id.slice(id.indexOf('/') + 1)
  return filters
    .flatMap((value) => value.split(','))
    .some((filter) => {
      const pattern = new RegExp(
        `^${filter.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
      )
      return pattern.test(id) || pattern.test(name)
    })
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function serve(directory, port) {
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
    server.listen(port, '127.0.0.1', () => done(server))
  })
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function decodePng(buffer) {
  let offset = 8
  let header = null
  const chunks = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        interlace: data[12],
      }
    } else if (type === 'IDAT') chunks.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (header?.depth !== 8 || header.interlace !== 0 || ![2, 6].includes(header.color)) {
    throw new Error('Unsupported screenshot format')
  }
  const channels = header.color === 6 ? 4 : 3
  const stride = header.width * channels
  const raw = inflateSync(Buffer.concat(chunks))
  const pixels = Buffer.alloc(header.height * stride)
  for (let y = 0; y < header.height; y++) {
    const filter = raw[y * (stride + 1)]
    const start = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[row + x - channels] : 0
      const b = y > 0 ? pixels[row - stride + x] : 0
      const c = y > 0 && x >= channels ? pixels[row - stride + x - channels] : 0
      const value = raw[start + x]
      const predicted =
        filter === 1
          ? a
          : filter === 2
            ? b
            : filter === 3
              ? (a + b) >> 1
              : filter === 4
                ? paeth(a, b, c)
                : 0
      pixels[row + x] = (value + predicted) & 255
    }
  }
  return { width: header.width, height: header.height, channels, pixels }
}

function changedPixels(first, second) {
  const a = decodePng(first)
  const b = decodePng(second)
  if (a.width !== b.width || a.height !== b.height) return a.width * a.height
  let count = 0
  for (let index = 0; index < a.width * a.height; index++) {
    let difference = 0
    for (let channel = 0; channel < 3; channel++) {
      difference = Math.max(
        difference,
        Math.abs(a.pixels[index * a.channels + channel] - b.pixels[index * b.channels + channel]),
      )
    }
    if (difference > 8) count++
  }
  return count
}

const blankStyle = JSON.stringify({ version: 8, sources: {}, layers: [] })

function browserArgs(name) {
  if (name !== 'chromium') return []
  if (options.software) return ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  if (platform() === 'darwin') return ['--use-angle=metal', '--enable-gpu']
  return ['--enable-unsafe-swiftshader']
}

function browserEnv(name) {
  if (name !== 'firefox' || platform() !== 'darwin') return process.env
  return { ...process.env, CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), 'graph-firefox-')) }
}

function install() {
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

class Failure extends Error {}

async function drawnPixels(page) {
  const rect = await page.evaluate(() => {
    const canvas = window.__harness.canvas()
    canvas.scrollIntoView({ block: 'center', inline: 'center' })
    const box = canvas.getBoundingClientRect()
    return { x: box.left, y: box.top, width: box.width, height: box.height }
  })
  const clip = {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width:
      Math.min(viewport.width, Math.floor(rect.x + rect.width)) - Math.max(0, Math.floor(rect.x)),
    height:
      Math.min(viewport.height, Math.floor(rect.y + rect.height)) - Math.max(0, Math.floor(rect.y)),
  }
  if (clip.width <= 0 || clip.height <= 0) throw new Failure('canvas has no visible area')
  await page.evaluate(() => window.__harness.frames(2))
  const shown = await page.screenshot({ clip })
  await page.evaluate(() => {
    window.__harness.canvas().style.visibility = 'hidden'
    return window.__harness.frames(2)
  })
  const hidden = await page.screenshot({ clip })
  await page.evaluate(() => {
    window.__harness.canvas().style.visibility = ''
    return window.__harness.frames(2)
  })
  return changedPixels(shown, hidden)
}

async function wheelZooms(page) {
  const zoomed = (before) =>
    page
      .waitForFunction(
        (zoom) =>
          window.__harness.hinted || Math.abs(window.graph.store.get().view.zoom / zoom - 1) > 0.01,
        before,
        { timeout: 10000, polling: 50 },
      )
      .then(
        () => page.evaluate((zoom) => window.graph.store.get().view.zoom !== zoom, before),
        () => false,
      )
  await page.evaluate(() => {
    window.__harness.hinted = false
    window.graph.on('zoomhint', () => {
      window.__harness.hinted = true
    })
  })
  let start = await page.evaluate(() => window.__harness.spot())
  if (!start) throw new Failure('no free point on the canvas')
  await page.mouse.move(start.x, start.y)
  await page.mouse.wheel(0, -240)
  if (await zoomed(start.zoom)) return
  if (!(await page.evaluate(() => window.__harness.hinted))) throw new Failure('wheel did not zoom')
  start = await page.evaluate(() => window.__harness.spot())
  await page.mouse.move(start.x, start.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -240)
  await page.keyboard.up('Control')
  await page.evaluate(() => {
    window.__harness.hinted = false
  })
  if (!(await zoomed(start.zoom))) throw new Failure('control and wheel did not zoom')
}

async function visit(browser, name, suite, entry) {
  const id = `${suite.name}/${entry.name}`
  const expect = expectations[id] ?? {}
  const folder = join(out, name)
  const file = id.replace('/', '-')
  const errors = []
  const warnings = []
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.route(
    (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
    (route) =>
      route.request().url().endsWith('/style.json')
        ? route.fulfill({ contentType: 'application/json', body: blankStyle })
        : route.abort(),
  )
  await context.addInitScript(install)
  const page = await context.newPage()
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error') {
      if (
        !allowedErrors.some((allowed) => allowed.browser === name && allowed.pattern.test(text))
      ) {
        errors.push(text)
      }
    } else if (message.type() === 'warning') warnings.push(text)
  })
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message}`))
  const started = performance.now()
  const result = { id, browser: name, status: 'pass', reason: '', drawn: 0, warnings, time: 0 }
  try {
    await page.goto(`http://127.0.0.1:${suite.port}${entry.path}`, { waitUntil: 'load' })
    await page
      .waitForFunction(() => window.__harness.ready(), null, { timeout: 60000, polling: 100 })
      .catch(() => {
        throw new Failure('no graph mounted')
      })
    result.ready = Math.round(performance.now() - started)
    if (!(await page.evaluate((limit) => window.__harness.settle(limit), 45000))) {
      throw new Failure('layout did not settle')
    }
    result.settled = Math.round(performance.now() - started)
    await page.evaluate(() => window.__harness.frames(3))
    await page.waitForTimeout(300)
    mkdirSync(folder, { recursive: true })
    await page.screenshot({ path: join(folder, `${file}.png`) })
    result.drawn = await drawnPixels(page)
    if (result.drawn < 100) throw new Failure(`canvas draws ${result.drawn} pixels`)
    const node = await page.evaluate(() => window.__harness.find())
    if (!node) throw new Failure('no node to point at')
    await page.mouse.move(node.x, node.y, { steps: 2 })
    await page
      .waitForFunction((key) => window.graph.store.get().hovered?.key === key, node.key, {
        timeout: 10000,
        polling: 50,
      })
      .catch(() => {
        throw new Failure('hover did not pick the node')
      })
    if (expect.select !== false) {
      let point = node
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.evaluate(() => window.__harness.frames(2))
        const next = await page.evaluate((key) => window.__harness.locate(key), node.key)
        if (!next || (next.x === point.x && next.y === point.y)) break
        point = next
        await page.mouse.move(point.x, point.y, { steps: 2 })
      }
      await page.mouse.click(point.x, point.y)
      await page
        .waitForFunction(
          (key) => window.graph.store.get().selection.nodes.includes(key),
          node.key,
          { timeout: 10000, polling: 50 },
        )
        .catch(() => {
          throw new Failure('click did not select the node')
        })
    }
    await wheelZooms(page)
    if (errors.length > 0) throw new Failure(`console: ${errors[0]}`)
  } catch (error) {
    result.status = 'fail'
    result.reason =
      error instanceof Failure
        ? error.message
        : String(error?.message ?? error)
            .split('\n')[0]
            .slice(0, 160)
    if (errors.length > 0 && !result.reason.startsWith('console')) {
      result.reason += `; console: ${errors[0]}`
    }
    mkdirSync(folder, { recursive: true })
    await page.screenshot({ path: join(folder, `${file}-failure.png`) }).catch(() => {})
  }
  result.errors = errors
  result.time = Math.round(performance.now() - started)
  await context.close()
  return result
}

async function webgl2(browser) {
  const page = await browser.newPage()
  const info = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    if (!gl) return null
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  })
  await page.close()
  return info
}

function every(pages, name, status, reason) {
  return pages.map(({ suite, entry }) => ({
    id: `${suite.name}/${entry.name}`,
    browser: name,
    status,
    reason,
  }))
}

async function run(name, pages) {
  const skip = expectedSkips.find(
    (entry) => entry.browser === name && entry.platform === platform(),
  )
  if (skip) return every(pages, name, 'skip', skip.reason)
  let browser
  try {
    browser = await engines[name].launch({
      headless: !options.headed,
      args: browserArgs(name),
      env: browserEnv(name),
    })
  } catch (error) {
    const lines = String(error?.message ?? error).split('\n')
    const cause = lines.find((line) => /\[err\]/.test(line) && !/headless mode/.test(line))
    const reason = `launch failed: ${(cause ?? lines[0]).replace(/^.*\[err\]\s*/, '')}`
    console.log(`${name}: ${reason}`)
    return every(pages, name, 'fail', reason)
  }
  const results = []
  try {
    const renderer = await webgl2(browser)
    console.log(`${name} ${browser.version()}: ${renderer ?? 'no WebGL2'}`)
    if (!renderer) {
      const headless = platform() === 'linux' && !process.env.DISPLAY
      return every(pages, name, 'fail', `no WebGL2 context${headless ? ' without a display' : ''}`)
    }
    const queue = [...pages]
    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          const result = await visit(browser, name, next.suite, next.entry)
          results.push(result)
          const detail = result.status === 'pass' ? `${result.time} ms` : result.reason
          console.log(`${name.padEnd(8)} ${result.status} ${result.id} (${detail})`)
        }
      }),
    )
  } finally {
    await browser.close()
  }
  return results
}

function table(results, pages) {
  const header = `| page | ${names.join(' | ')} |`
  const rule = `| --- | ${names.map(() => '---').join(' | ')} |`
  const rows = pages.map(({ suite, entry }) => {
    const id = `${suite.name}/${entry.name}`
    const cells = names.map((name) => {
      const result = results.find((item) => item.id === id && item.browser === name)
      if (!result) return ''
      return result.status === 'pass' ? 'pass' : `${result.status}: ${result.reason}`
    })
    return `| ${id} | ${cells.join(' | ')} |`
  })
  return [header, rule, ...rows].join('\n')
}

const servers = new Map()
try {
  const pages = []
  const built = new Set()
  for (const suite of suites) {
    const wanted = (options.example ?? []).length === 0
    if (
      !wanted &&
      !options.example.some((filter) => filter.startsWith(suite.name) || !filter.includes('/'))
    ) {
      continue
    }
    if (!built.has(suite.build) && (options.build || !existsSync(suite.directory))) {
      const [command, args] = suite.build
      const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
      if (result.status !== 0) throw new Error(`${suite.name} build failed`)
      built.add(suite.build)
    }
    for (const entry of suite.pages(suite.directory)) {
      if (matches(`${suite.name}/${entry.name}`, options.example)) pages.push({ suite, entry })
    }
    if (!servers.has(suite.port)) servers.set(suite.port, await serve(suite.directory, suite.port))
  }
  if (pages.length === 0) throw new Error('No page matches the filter')
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const results = (await Promise.all(names.map((name) => run(name, pages)))).flat()
  const summary = table(results, pages)
  console.log(`\n${summary}\n`)
  writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2))
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
  const failed = results.filter((result) => result.status === 'fail').length
  const passed = results.filter((result) => result.status === 'pass').length
  console.log(`${passed} passed, ${failed} failed, ${results.length - passed - failed} skipped`)
  process.exitCode = failed > 0 ? 1 : 0
} finally {
  for (const server of servers.values()) server.close()
}
