import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, relative, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import {
  browserArgs,
  docsExamples,
  docsShowcases,
  docsSite,
  install,
  isolate,
  root,
} from './harness.mjs'

const { values: options } = parseArgs({
  allowNegative: true,
  options: {
    base: { type: 'string', default: '/graph/' },
    build: { type: 'boolean', default: false },
    workers: { type: 'string', default: '4' },
    software: { type: 'boolean', default: false },
    page: { type: 'string', multiple: true },
    origin: { type: 'string', default: process.env.DOCS_ORIGIN ?? 'https://bruno00o.github.io' },
  },
})

const base = `/${options.base.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/')
const siteOrigin = options.origin.replace(/\/+$/, '')
const workers = Math.max(1, Number(options.workers) || 1)
const viewport = { width: 1280, height: 900 }

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile()
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory()
}

function resolveRequest(directory, url) {
  const { pathname } = new URL(url, 'http://localhost')
  if (pathname === base.slice(0, -1)) return { redirect: base }
  if (!pathname.startsWith(base)) return { status: 404 }
  const path = decodeURIComponent(pathname.slice(base.length))
  const file = normalize(join(directory, path))
  if (file !== directory && !file.startsWith(directory + sep)) return { status: 403 }
  if (isFile(file)) return { status: 200, file }
  if (isDirectory(file)) {
    if (!pathname.endsWith('/')) return { redirect: `${pathname}/` }
    const index = join(file, 'index.html')
    if (isFile(index)) return { status: 200, file: index }
  } else if (!pathname.endsWith('/') && isFile(`${file}.html`)) {
    return { status: 200, file: `${file}.html` }
  }
  const missing = join(directory, '404.html')
  return isFile(missing) ? { status: 404, file: missing } : { status: 404 }
}

function serve(directory) {
  const server = createServer((request, response) => {
    const found = resolveRequest(directory, request.url ?? '/')
    if (found.redirect) {
      response.writeHead(301, { location: found.redirect }).end()
      return
    }
    if (!found.file) {
      response.writeHead(found.status).end()
      return
    }
    response.writeHead(found.status, {
      'content-type': types[extname(found.file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(readFileSync(found.file))
  })
  return new Promise((done, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () =>
      done({ server, origin: `http://127.0.0.1:${server.address().port}` }),
    )
  })
}

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'assets' ? [] : htmlFiles(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

function urlOf(file) {
  const path = relative(docsSite, file).split(sep).join('/')
  if (path === '404.html') return null
  if (path === 'index.html') return base
  return `${base}${path.replace(/\/index\.html$/, '').replace(/\.html$/, '')}`
}

function ids(file) {
  const found = new Set()
  for (const match of readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)) found.add(match[1])
  return found
}

function checkBuild() {
  const index = readFileSync(join(docsSite, 'index.html'), 'utf8')
  if (!index.includes(`href="${base}assets/`)) {
    throw new Error(
      `docs/dist/client was not built for the base ${base}: run DOCS_BASE=${base} pnpm docs:build`,
    )
  }
}

const failures = []

function fail(where, what) {
  failures.push(`${where}: ${what}`)
  console.log(`fail ${where}: ${what}`)
}

async function collect(page) {
  return page.evaluate(() => {
    const urls = []
    for (const element of document.querySelectorAll('[href], [src]')) {
      const value = element.getAttribute('href') ?? element.getAttribute('src')
      if (value === null || value === '' || value.startsWith('#')) continue
      urls.push(new URL(value, document.baseURI).href)
    }
    for (const element of document.querySelectorAll('[srcset]')) {
      for (const part of (element.getAttribute('srcset') ?? '').split(',')) {
        const value = part.trim().split(/\s+/)[0]
        if (value) urls.push(new URL(value, document.baseURI).href)
      }
    }
    return urls
  })
}

async function visit(browser, origin, entry, seen) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  await context.addInitScript(install)
  const page = await context.newPage()
  const where = entry.path
  const local = (url) => url.startsWith(origin)
  page.on('console', (message) => {
    if (message.type() === 'error') fail(where, `console: ${message.text().split('\n')[0]}`)
  })
  page.on('pageerror', (error) => fail(where, `uncaught: ${error.message.split('\n')[0]}`))
  page.on('requestfailed', (request) => {
    if (local(request.url())) fail(where, `request failed: ${request.url()}`)
  })
  page.on('response', (response) => {
    if (local(response.url()) && response.status() >= 400) {
      fail(where, `${response.status()} ${response.url()}`)
    }
  })
  try {
    const response = await page.goto(`${origin}${entry.path}`, { waitUntil: 'load' })
    if (response?.status() !== 200) fail(where, `document answers ${response?.status()}`)
    if (entry.graph) {
      await page
        .waitForFunction(() => window.__harness.ready(), null, { timeout: 60000, polling: 100 })
        .catch(() => fail(where, 'no graph mounted'))
      await page.evaluate(() => window.__harness.frames(3)).catch(() => {})
    } else {
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    }
    const title = await page.title()
    if (title === '') fail(where, 'empty title')
    for (const url of await collect(page)) {
      if (local(url)) seen.add(url)
    }
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await context.close()
}

function checkLinks(origin, seen) {
  const checked = new Set()
  for (const url of [...seen].sort()) {
    const [path, hash = ''] = url.split('#')
    const found = resolveRequest(docsSite, path.slice(origin.length))
    if (!checked.has(path)) {
      checked.add(path)
      if (found.status !== 200 && !found.redirect) fail(path, `local link answers ${found.status}`)
    }
    if (hash && found.status === 200 && found.file.endsWith('.html')) {
      if (!ids(found.file).has(decodeURIComponent(hash))) fail(url, 'anchor not found in the page')
    }
  }
  return checked.size
}

const fences = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm
const leftoverTags = /<(?:LiveExample|Callout|Cards?|Tabs?|ApiTable|api-table)\b/

function filesIn(directory, suffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesIn(path, suffix)
    return entry.name.endsWith(suffix) ? [path] : []
  })
}

function resolveSite(path) {
  const found = resolveRequest(docsSite, path)
  return found.redirect ? resolveRequest(docsSite, found.redirect) : found
}

function readSite(where, path) {
  const found = resolveSite(`${base}${path}`)
  if (found.status !== 200 || !found.file) {
    fail(where, `${path} is missing under ${base}`)
    return null
  }
  return readFileSync(found.file, 'utf8')
}

function checkMarkdownLinks(where, text, checked) {
  let count = 0
  const prefix = `${siteOrigin}${base}`
  for (const [, link] of text.replace(fences, '').matchAll(/\[[^\]]*\]\((\S+?)\)/g)) {
    if (link.startsWith('/')) {
      fail(where, `root-relative link ${link}`)
      continue
    }
    if (!link.startsWith(prefix)) continue
    count++
    const [path = '', hash = ''] = link.slice(siteOrigin.length).split('#')
    const found = resolveSite(path)
    if (found.status !== 200 || !found.file) {
      if (!checked.has(path)) fail(where, `link answers ${found.status}: ${link}`)
      checked.add(path)
      continue
    }
    if (hash === '') continue
    const anchor = decodeURIComponent(hash)
    const known = found.file.endsWith('.md')
      ? readFileSync(found.file, 'utf8').includes(`[#${anchor}]`)
      : found.file.endsWith('.html') && ids(found.file).has(anchor)
    if (!known) fail(where, `anchor not found: ${link}`)
  }
  return count
}

function checkManifest(text) {
  const where = 'ard.json'
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    fail(where, `invalid JSON: ${error.message}`)
    return
  }
  const prefix = `${siteOrigin}${base}`
  if (data.specVersion !== '1.0') fail(where, 'specVersion must be "1.0"')
  if (!data.host?.displayName) fail(where, 'host.displayName is missing')
  if (!data.host?.documentationUrl?.startsWith(prefix)) {
    fail(where, 'host.documentationUrl is not under the site')
  }
  if (!Array.isArray(data.entries) || data.entries.length === 0) {
    fail(where, 'entries must be a non-empty array')
    return
  }
  const urn = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/
  const identifiers = new Set()
  for (const entry of data.entries) {
    const label = entry.displayName ?? entry.identifier ?? 'entry'
    if (!urn.test(entry.identifier ?? '')) fail(where, `${label}: invalid identifier`)
    if (identifiers.has(entry.identifier)) fail(where, `${label}: duplicate identifier`)
    identifiers.add(entry.identifier)
    if (!entry.displayName) fail(where, `${label}: no displayName`)
    if (!entry.type) fail(where, `${label}: no type`)
    if ('url' in entry === 'data' in entry) fail(where, `${label}: needs one of url and data`)
    const queries = entry.representativeQueries
    if (!Array.isArray(queries) || queries.length < 2 || queries.length > 5) {
      fail(where, `${label}: representativeQueries must list 2 to 5 queries`)
    }
    if (entry.url) {
      if (!entry.url.startsWith(prefix)) fail(where, `${label}: url is not under ${prefix}`)
      else if (resolveSite(entry.url.slice(siteOrigin.length)).status !== 200) {
        fail(where, `${label}: url does not resolve`)
      }
    }
  }
}

function checkAgentFiles() {
  const checked = new Set()
  const prefix = `${siteOrigin}${base}`
  let count = 0
  const index = readSite('llms.txt', 'llms.txt')
  if (index !== null) {
    if (!/^\s*#\s+\S/m.test(index)) fail('llms.txt', 'no H1 title')
    if (!/^> \S/m.test(index)) fail('llms.txt', 'no summary')
    if (index.length < 50) fail('llms.txt', 'too short')
    count += checkMarkdownLinks('llms.txt', index, checked)
    for (const required of [
      'llms-full.txt',
      'docs/index.md',
      'docs/api/define-graph.md',
      'examples/selection',
      'ard.json',
    ]) {
      if (!index.includes(`](${prefix}${required})`)) fail('llms.txt', `no link to ${required}`)
    }
  }
  const markdown = filesIn(join(docsSite, 'docs'), '.md')
  const pages = filesIn(join(docsSite, 'docs'), 'index.html').length
  if (markdown.length !== pages) fail('docs', `${markdown.length} Markdown files, ${pages} pages`)
  const full = readSite('llms-full.txt', 'llms-full.txt')
  if (full !== null) {
    if (!/^# \S/.test(full)) fail('llms-full.txt', 'no H1 title')
    const sections = full.split(/^Page: /m).length - 1
    if (sections !== markdown.length) {
      fail('llms-full.txt', `${sections} pages for ${markdown.length} Markdown files`)
    }
    count += checkMarkdownLinks('llms-full.txt', full, checked)
  }
  for (const file of markdown) {
    const where = relative(docsSite, file).split(sep).join('/')
    const text = readFileSync(file, 'utf8')
    if (!/^# \S/.test(text)) fail(where, 'no H1 title')
    if (text.trim().split('\n').length < 6) fail(where, 'almost empty')
    if (leftoverTags.test(text.replace(fences, ''))) fail(where, 'a component tag is left in it')
    count += checkMarkdownLinks(where, text, checked)
  }
  const manifest = readSite('ard.json', 'ard.json')
  if (manifest !== null) checkManifest(manifest)
  const home = readSite('index.html', 'index.html')
  for (const rel of ['ard', 'ai-catalog']) {
    const href = new RegExp(`<link[^>]*rel="${rel}"[^>]*href="([^"]+)"`).exec(home ?? '')?.[1]
    if (!href) fail('index.html', `no <link rel="${rel}">`)
    else if (resolveSite(href).status !== 200) fail('index.html', `${href} is missing`)
  }
  const nodes = readSite('docs/api/nodes', 'docs/api/nodes/index.html')
  if (nodes !== null && !nodes.includes(`href="${base}docs/api/nodes.md"`)) {
    fail('docs/api/nodes', 'no link to its Markdown page')
  }
  return count + markdown.length + 3
}

function webToolsBrowser(flag) {
  return chromium.launch({
    args: [...browserArgs('chromium', options.software), ...(flag ? [flag] : [])],
  })
}

async function checkWebTools(origin) {
  const where = 'web tools'
  const browser = await webToolsBrowser('--enable-experimental-web-platform-features')
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  const page = await context.newPage()
  const logged = []
  page.on('console', (message) => logged.push(message.text()))
  page.on('pageerror', (error) => fail(where, `uncaught: ${error.message.split('\n')[0]}`))
  try {
    await page.goto(`${origin}${base}`, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    if (!(await page.evaluate(() => typeof document.modelContext === 'object'))) {
      console.log('skip web tools: this Chromium has no document.modelContext')
    } else {
      await page
        .waitForFunction(async () => (await document.modelContext.getTools()).length >= 4, null, {
          timeout: 10000,
        })
        .catch(() => fail(where, 'the tools were not registered'))
      const result = await page.evaluate(async () => {
        const context = document.modelContext
        const call = async (name, input) => {
          const tool = (await context.getTools()).find((item) => item.name === name)
          return tool ? JSON.parse(await context.executeTool(tool, input)) : { missing: true }
        }
        const tools = await context.getTools()
        return {
          names: tools.map((tool) => tool.name).sort(),
          schemas: tools.map((tool) => [
            tool.name,
            tool.inputSchema?.type,
            tool.annotations?.readOnlyHint,
          ]),
          search: await call('search_docs', { query: 'force layout', limit: 3 }),
          page: await call('read_docs_page', { path: 'api/define-graph' }),
          missing: await call('read_docs_page', { path: 'no/such/page' }),
          examples: await call('list_examples', { category: 'layouts' }),
          example: await call('get_example', { slug: 'selection' }),
          unknown: await call('get_example', { slug: 'no-such-example' }),
        }
      })
      const expected = ['get_example', 'list_examples', 'read_docs_page', 'search_docs']
      if (result.names.join() !== expected.join()) fail(where, `tools: ${result.names.join(', ')}`)
      for (const [name, type, readOnly] of result.schemas) {
        if (type !== 'object' || readOnly !== true) fail(where, `${name}: schema or annotations`)
      }
      const text = (value) => value?.content?.[0]?.text ?? ''
      const hits = JSON.parse(text(result.search) || '{}').results ?? []
      if (hits.length === 0 || hits.length > 3) fail(where, `search_docs gave ${hits.length} hits`)
      if (!text(result.page).startsWith('# defineGraph')) fail(where, 'read_docs_page: wrong page')
      if (result.missing.isError !== true) fail(where, 'read_docs_page accepted an unknown page')
      const listed = JSON.parse(text(result.examples) || '{}')
      if (!(listed.count > 0) || listed.examples.some((item) => item.category !== 'layouts')) {
        fail(where, 'list_examples does not filter by category')
      }
      const example = JSON.parse(text(result.example) || '{}')
      if (!example.url?.startsWith(`${origin}${base}examples/selection`)) {
        fail(where, 'get_example gave the wrong address')
      }
      if (result.unknown.isError !== true) fail(where, 'get_example accepted an unknown slug')
    }
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await browser.close()
  for (const message of logged) {
    if (/modelContext|WebMCP/i.test(message)) fail(where, `console: ${message}`)
  }
}

async function checkWithoutWebTools(browser, origin) {
  const where = 'without web tools'
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  const page = await context.newPage()
  const logged = []
  const requested = []
  page.on('console', (message) => logged.push(message.text()))
  page.on('pageerror', (error) => fail(where, `uncaught: ${error.message.split('\n')[0]}`))
  page.on('request', (request) => requested.push(request.url()))
  try {
    await page.goto(`${origin}${base}`, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    if (await page.evaluate(() => 'modelContext' in document)) {
      console.log('skip without web tools: this Chromium has document.modelContext by default')
      await context.close()
      return
    }
    if (requested.some((url) => /web-tools/.test(url))) fail(where, 'the tools were loaded')
    for (const message of logged) {
      if (/modelContext|WebMCP/i.test(message)) fail(where, `console: ${message}`)
    }
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await context.close()
}

async function checkSearch(browser, origin) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  const page = await context.newPage()
  const where = 'search'
  const asked = []
  page.on('console', (message) => {
    if (message.type() === 'error') fail(where, `console: ${message.text().split('\n')[0]}`)
  })
  page.on('pageerror', (error) => fail(where, `uncaught: ${error.message.split('\n')[0]}`))
  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return
    asked.push(response.url())
    if (response.status() >= 400) fail(where, `${response.status()} ${response.url()}`)
  })
  try {
    await page.goto(`${origin}${base}`, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    await page.keyboard.press('Control+k')
    const input = page.locator('[role="dialog"] input')
    await input.waitFor({ timeout: 10000 })
    await input.fill('force layout')
    const result = page.locator('[role="dialog"] [role="option"]').first()
    await result.waitFor({ timeout: 20000 })
    if (!asked.some((url) => url === `${origin}${base}api/search`)) {
      fail(where, 'the search index was not read from the base path')
    }
    await result.click()
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith(`${base}docs/`) || url.pathname.startsWith(`${base}examples/`),
      { timeout: 10000 },
    )
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    const lost = await page.locator('.not-found').count()
    if (lost > 0) fail(where, 'a search result opens the not-found page')
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await context.close()
}

async function checkNavigation(browser, origin) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  const page = await context.newPage()
  const where = 'navigation'
  page.on('console', (message) => {
    if (message.type() === 'error') fail(where, `console: ${message.text().split('\n')[0]}`)
  })
  page.on('pageerror', (error) => fail(where, `uncaught: ${error.message.split('\n')[0]}`))
  page.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      fail(where, `${response.status()} ${response.url()}`)
    }
  })
  try {
    await page.goto(`${origin}${base}`, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    for (const target of ['docs', 'examples', 'showcase', 'benchmark']) {
      await page.locator(`header a[href="${base}${target}"]`).first().click()
      await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === `${base}${target}`, {
        timeout: 10000,
      })
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
      if ((await page.locator('.not-found').count()) > 0) fail(where, `${target} is not found`)
    }
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await context.close()
}

async function checkMissing(browser, origin, seen) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await isolate(context)
  const page = await context.newPage()
  const where = 'missing page'
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('404')) {
      errors.push(message.text().split('\n')[0])
    }
  })
  page.on('pageerror', (error) => errors.push(`uncaught: ${error.message.split('\n')[0]}`))
  try {
    const response = await page.goto(`${origin}${base}no/such/page`, { waitUntil: 'load' })
    if (response?.status() !== 404) fail(where, `answers ${response?.status()} instead of 404`)
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    if ((await page.locator('.not-found').count()) === 0) fail(where, 'no not-found page')
    const styled = await page.evaluate(() => document.styleSheets.length > 0)
    if (!styled) fail(where, 'the not-found page has no style')
    for (const url of await collect(page)) {
      if (url.startsWith(origin)) seen.add(url)
    }
    for (const error of errors) fail(where, `console: ${error}`)
  } catch (error) {
    fail(where, String(error?.message ?? error).split('\n')[0])
  }
  await context.close()
}

if (options.build) {
  const result = spawnSync('pnpm', ['docs:build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DOCS_BASE: base },
  })
  if (result.status !== 0) throw new Error('docs:build failed')
}
checkBuild()

const examples = await docsExamples()
const showcases = await docsShowcases()
const graphPaths = new Set([
  ...examples.map(({ slug }) => `${base}examples/${slug}`),
  ...showcases.map(({ slug }) => `${base}showcase/${slug}`),
])
const entries = htmlFiles(docsSite)
  .map(urlOf)
  .filter((path) => path !== null)
  .map((path) => ({ path, graph: graphPaths.has(path) }))
  .filter(({ path }) => !options.page || options.page.some((filter) => path.includes(filter)))
  .sort((a, b) => a.path.localeCompare(b.path))
const missing = [...graphPaths].filter((path) => !entries.some((entry) => entry.path === path))
if (!options.page && missing.length > 0) {
  throw new Error(`No prerendered page for ${missing.join(', ')}`)
}

const { server, origin } = await serve(docsSite)
const browser = await chromium.launch({ args: browserArgs('chromium', options.software) })
try {
  const seen = new Set()
  const queue = [...entries]
  const started = performance.now()
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        await visit(browser, origin, next, seen)
      }
    }),
  )
  await checkSearch(browser, origin)
  await checkNavigation(browser, origin)
  await checkMissing(browser, origin, seen)
  const links = checkLinks(origin, seen)
  const agentChecks = checkAgentFiles()
  await checkWithoutWebTools(browser, origin)
  await checkWebTools(origin)
  const seconds = Math.round((performance.now() - started) / 1000)
  console.log(
    `${entries.length} pages and ${links} local links checked under ${base} in ${seconds} s`,
  )
  console.log(`${agentChecks} links and files of llms.txt, ard.json and the Markdown pages checked`)
} finally {
  await browser.close()
  server.close()
}

if (failures.length > 0) {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}`)
  process.exitCode = 1
} else {
  console.log('The site is ready to publish')
}
