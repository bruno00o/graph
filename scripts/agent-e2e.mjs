import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const port = Number(process.env.AGENT_E2E_PORT ?? 5640)
const url = `http://localhost:${port}`
const cli = join(root, 'src/agent/cli.ts')
const folder = join(root, 'examples', '.graph-agent')

async function agent(...words) {
  try {
    const { stdout } = await run(process.execPath, [cli, ...words, '--url', url], { cwd: root })
    return JSON.parse(stdout)
  } catch (error) {
    throw new Error(`graph-agent ${words.join(' ')} failed: ${error.stdout || error.message}`)
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`ok ${message}`)
}

const server = await createServer({
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'warn',
  server: { port, strictPort: true },
})
await server.listen()
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
let failed = false
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${url}/vanilla/`)
  await page.waitForFunction(() => window.graph !== undefined, null, { timeout: 60_000 })

  const tabs = await agent('tabs')
  check(tabs.tabs.length === 1 && tabs.tabs[0].url.includes('/vanilla/'), 'the page is connected')

  const graphs = await agent('graphs')
  check(graphs.graphs.length === 1 && graphs.graphs[0].nodes > 0, 'the page lists its graph')

  const shot = await agent('snapshot', '--limit', '10')
  const first = shot.elements.find((element) => element.kind === 'node')
  check(shot.settled === true && shot.counts.nodes > 0, 'the snapshot waits for a settled graph')
  check(shot.elements.length <= 11 && first !== undefined, 'the snapshot lists the first nodes')

  const key = typeof first.key === 'object' ? JSON.stringify(first.key) : String(first.key)
  const acted = await agent('act', 'select', `node:${key}`, 'then', 'fit', 'selection')
  check(acted.ok === true && acted.settled === true, 'act runs its steps and settles')
  check(acted.changed.selection.nodes.length === 1, 'act tells the new selection')
  check(acted.changed.view !== undefined, 'act tells the new view')
  const selected = await page.evaluate(() => window.graph.selection.get().nodes)
  check(selected.length === 1 && String(selected[0]) === key, 'the page selects the node')

  const found = await agent('query', '--within', 'selection')
  check(found.total === 1 && String(found.items[0].key) === key, 'query finds the selection')

  const image = await agent('image')
  const bytes = readFileSync(image.path)
  check(bytes.subarray(1, 4).toString() === 'PNG' && bytes.length > 1000, 'image writes a PNG')

  const changes = await agent('changes')
  check(
    changes.changes.some((change) => change.type === 'selection' && change.origin === 'agent'),
    'changes tell what the agent did',
  )
  check(errors.length === 0, `the page has no error${errors.length ? `: ${errors[0]}` : ''}`)
} catch (error) {
  failed = true
  console.error(error.message)
} finally {
  await browser.close()
  await server.close()
  if (existsSync(folder)) rmSync(folder, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
