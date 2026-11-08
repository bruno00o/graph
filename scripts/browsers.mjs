import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { platform } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { inflateSync } from 'node:zlib'
import { chromium, firefox, webkit } from 'playwright'
import {
  browserArgs,
  browserEnv,
  docsExamples,
  docsShowcases,
  docsSite,
  install,
  isolate,
  root,
  run as runCommand,
  serve,
} from './harness.mjs'

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

const docs = await docsExamples()
const showcases = await docsShowcases()

const suites = [
  {
    name: 'examples',
    directory: examples,
    build: buildExamples,
    pages: examplePages,
  },
  {
    name: 'low',
    directory: examples,
    build: buildExamples,
    pages: (directory) =>
      examplePages(directory)
        .filter((entry) => lowCapsPages.includes(entry.name))
        .map((entry) => ({ ...entry, path: `${entry.path}?caps=low` })),
  },
  {
    name: 'docs',
    directory: docsSite,
    build: ['pnpm', ['docs:build']],
    pages: () => docs.map(({ slug }) => ({ name: slug, path: `/examples/${slug}` })),
  },
  {
    name: 'showcase',
    directory: docsSite,
    build: ['pnpm', ['docs:build']],
    pages: () => showcases.map(({ slug }) => ({ name: slug, path: `/showcase/${slug}` })),
  },
]

const expectations = {
  'examples/explore': { select: false },
  'examples/filter': { select: false },
  ...Object.fromEntries(docs.map(({ slug, meta }) => [`docs/${slug}`, meta.harness ?? {}])),
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
  await isolate(context)
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
    await page.goto(`${servers.get(suite.directory).origin}${entry.path}`, { waitUntil: 'load' })
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
    let point = node
    await page.mouse.move(point.x, point.y, { steps: 2 })
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.evaluate(() => window.__harness.frames(2))
      const next = await page.evaluate((key) => window.__harness.locate(key), node.key)
      if (!next || (next.x === point.x && next.y === point.y)) break
      point = next
      await page.mouse.move(point.x, point.y)
    }
    await page
      .waitForFunction((key) => window.graph.store.get().hovered?.key === key, node.key, {
        timeout: 10000,
        polling: 50,
      })
      .catch(() => {
        throw new Failure('hover did not pick the node')
      })
    if (expect.select !== false) {
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
      args: browserArgs(name, options.software),
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
      runCommand(...suite.build)
      built.add(suite.build)
    }
    for (const entry of suite.pages(suite.directory)) {
      if (matches(`${suite.name}/${entry.name}`, options.example)) pages.push({ suite, entry })
    }
    if (!servers.has(suite.directory)) servers.set(suite.directory, await serve(suite.directory))
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
  for (const { server } of servers.values()) server.close()
}
