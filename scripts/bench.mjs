import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const { values: options } = parseArgs({
  options: {
    nodes: { type: 'string', default: '50000' },
    edges: { type: 'string', default: '100000' },
    out: { type: 'string', default: 'bench-results' },
    vsync: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
  },
})

const width = 1280
const height = 800
const scale = 2
const debugPort = 9361
const root = resolve(import.meta.dirname, '..')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const caches =
    platform() === 'darwin'
      ? join(homedir(), 'Library/Caches/ms-playwright')
      : join(homedir(), '.cache/ms-playwright')
  const builds = existsSync(caches)
    ? readdirSync(caches)
        .filter((name) => /^chromium-\d+$/.test(name))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    : []
  const candidates = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-linux64/chrome',
    'chrome-linux/chrome',
  ]
  for (const build of builds) {
    for (const candidate of candidates) {
      const path = join(caches, build, candidate)
      if (existsSync(path)) return path
    }
  }
  throw new Error('Chrome for Testing not found: set CHROME_PATH')
}

async function connect(port) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: 'PUT',
      })
      return await response.json()
    } catch {
      await sleep(200)
    }
  }
  throw new Error('Chrome did not answer on the debugging port')
}

function session(socket) {
  let id = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      errors.push(details.exception?.description ?? details.text)
    } else if (
      message.method === 'Runtime.consoleAPICalled' &&
      ['error', 'warning'].includes(message.params.type)
    ) {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
    }
  })
  const send = (method, params = {}) =>
    new Promise((done) => {
      id += 1
      pending.set(id, done)
      socket.send(JSON.stringify({ id, method, params }))
    })
  return {
    send,
    errors,
    async evaluate(expression) {
      const response = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      const details = response.result?.exceptionDetails
      if (details) throw new Error(details.exception?.description ?? details.text)
      return response.result?.result?.value
    },
    async screenshot(path) {
      const response = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(response.result.data, 'base64'))
    },
    mouse(type, x, y, extra = {}) {
      return send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        clickCount: 1,
        ...extra,
      })
    },
  }
}

const helpers = `
  window.__bench = {
    stats(values) {
      const sorted = [...values].sort((a, b) => a - b)
      const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
      const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)
      return {
        count: sorted.length,
        mean,
        median: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        max: sorted.at(-1) ?? 0,
        top: sorted.slice(-6).reverse(),
      }
    },
    finish() {
      const canvas = window.bench.graph.element.querySelector('canvas')
      const gl = canvas.getContext('webgl2')
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    },
    async drive(frames, step) {
      const { nextFrame, frameCosts } = window.bench
      const from = frameCosts.length
      const durations = []
      await nextFrame()
      for (let index = 0; index < frames; index++) {
        const start = performance.now()
        step(index)
        await nextFrame()
        this.finish()
        durations.push(performance.now() - start)
      }
      await nextFrame()
      const worst = durations.indexOf(Math.max(...durations))
      return {
        frame: this.stats(durations),
        cost: this.stats(frameCosts.slice(from)),
        worst,
      }
    },
    focus() {
      const { graph, items } = window.bench
      const point = graph.positions.get(items[0].id)
      graph.view.set({ ...point, zoom: 1.5 })
      return point
    },
    async settle() {
      const { nextFrame } = window.bench
      for (let index = 0; index < 20; index++) await nextFrame()
      await new Promise((done) => setTimeout(done, 200))
      await nextFrame()
      this.finish()
    },
  }
`

const scenarios = {
  overviewPan: `(async () => {
    const { graph } = window.bench
    graph.view.fit()
    await __bench.settle()
    const start = graph.view.get()
    return __bench.drive(240, (i) => graph.view.set({ ...start, x: start.x + Math.sin(i / 20) * 200 / start.zoom }))
  })()`,
  zoomSweep: `(async () => {
    const { graph } = window.bench
    graph.view.fit()
    await __bench.settle()
    const start = graph.view.get()
    return __bench.drive(240, (i) => graph.view.set({ ...start, zoom: start.zoom * 1.012 ** i }))
  })()`,
  closePan: `(async () => {
    const { graph } = window.bench
    const center = __bench.focus()
    await __bench.settle()
    return __bench.drive(240, (i) => graph.view.set({ x: center.x + i * 3, y: center.y + Math.sin(i / 30) * 80, zoom: 1.5 }))
  })()`,
  pick: `(async () => {
    const { graph } = window.bench
    graph.view.fit()
    await __bench.settle()
    const { width, height } = graph.store.get()
    const t0 = performance.now()
    graph.pick({ x: width / 2, y: height / 2 })
    const build = performance.now() - t0
    const durations = []
    for (let i = 0; i < 1000; i++) {
      const t = performance.now()
      graph.pick({ x: Math.random() * width, y: Math.random() * height })
      durations.push(performance.now() - t)
    }
    return { firstPickWithBuild: build, pick: __bench.stats(durations) }
  })()`,
  selectAndMute: `(async () => {
    const { graph, items, links, nextFrame } = window.bench
    const key = items[0].id
    const t0 = performance.now()
    graph.selection.set({ nodes: [key] })
    await nextFrame()
    await nextFrame()
    const select = performance.now() - t0
    const keepNodes = new Set([key, ...graph.neighbors(key)])
    const keepEdges = new Set(graph.edgesOf(key))
    const t1 = performance.now()
    graph.states.set('muted', {
      nodes: items.filter((item) => !keepNodes.has(item.id)).map((item) => item.id),
      edges: links.filter((link) => !keepEdges.has(link.id)).map((link) => link.id),
    })
    const muteCall = performance.now() - t1
    await nextFrame()
    await nextFrame()
    const mute = performance.now() - t1
    const t2 = performance.now()
    graph.states.clear('muted')
    graph.selection.clear()
    await nextFrame()
    await nextFrame()
    return { select, muteCall, mute, clear: performance.now() - t2 }
  })()`,
  nodeDrag: `(async () => {
    const { graph } = window.bench
    __bench.focus()
    await __bench.settle()
    const { width, height } = graph.store.get()
    for (let dy = 0; dy < 200; dy += 4) {
      for (let dx = 0; dx < 200; dx += 4) {
        const hit = graph.pick({ x: width / 2 + dx, y: height / 2 + dy })
        if (hit?.kind === 'node') {
          const rect = graph.element.getBoundingClientRect()
          return { x: rect.left + width / 2 + dx, y: rect.top + height / 2 + dy, key: hit.key }
        }
      }
    }
    return null
  })()`,
}

async function measureDrag(page) {
  const target = await page.evaluate(scenarios.nodeDrag)
  if (!target) return null
  await page.evaluate(
    'window.__drag = { from: window.bench.frameCosts.length, t: performance.now() }',
  )
  await page.mouse('mouseMoved', target.x, target.y, { button: 'none' })
  await page.mouse('mousePressed', target.x, target.y)
  for (let step = 1; step <= 120; step++) {
    await page.mouse('mouseMoved', target.x + step * 2, target.y + Math.sin(step / 10) * 40, {
      buttons: 1,
    })
  }
  await page.mouse('mouseReleased', target.x + 240, target.y)
  return page.evaluate(`(async () => {
    await window.bench.nextFrame()
    return {
      key: ${JSON.stringify(target.key)},
      duration: performance.now() - window.__drag.t,
      cost: __bench.stats(window.bench.frameCosts.slice(window.__drag.from)),
    }
  })()`)
}

const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { port: 5199, strictPort: false },
})
await server.listen()
const base = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'
const profile = mkdtempSync(join(tmpdir(), 'graph-bench-'))
const flags = [
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  `--window-size=${width},${height}`,
  `--force-device-scale-factor=${scale}`,
  '--no-first-run',
  '--no-default-browser-check',
  ...(options.headed ? [] : ['--headless=new']),
  ...(platform() === 'darwin' ? ['--use-angle=metal'] : []),
  ...(options.vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']),
]
const chrome = spawn(findChrome(), flags, { stdio: 'ignore' })

try {
  const target = await connect(debugPort)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done) => socket.addEventListener('open', done, { once: true }))
  const page = session(socket)
  await page.send('Runtime.enable')
  await page.send('Page.enable')
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  })
  const url = `${base}bench/?nodes=${options.nodes}&edges=${options.edges}`
  await page.send('Page.navigate', { url })
  let ready = false
  for (let attempt = 0; attempt < 600 && !ready; attempt++) {
    await sleep(100)
    ready = await page.evaluate('Boolean(window.bench)').catch(() => false)
  }
  if (!ready) throw new Error(`bench page did not start: ${page.errors.join('\n')}`)
  await page.evaluate(helpers)

  const out = resolve(root, options.out)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  const results = {
    date: new Date().toISOString(),
    nodes: Number(options.nodes),
    edges: Number(options.edges),
    viewport: { width, height, scale },
    vsync: options.vsync,
    renderer: await page.evaluate(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
    })()`),
    load: await page.evaluate('window.bench.timings'),
  }
  await page.evaluate('__bench.settle()')
  await page.screenshot(join(out, 'overview-dark.png'))
  results.overviewPan = await page.evaluate(scenarios.overviewPan)
  results.zoomSweep = await page.evaluate(scenarios.zoomSweep)
  results.closePan = await page.evaluate(scenarios.closePan)
  await page.screenshot(join(out, 'close-dark.png'))
  results.pick = await page.evaluate(scenarios.pick)
  results.selectAndMute = await page.evaluate(scenarios.selectAndMute)
  results.nodeDrag = await measureDrag(page)
  await page.evaluate(`(async () => {
    const { graph, items, links } = window.bench
    const key = items[0].id
    const near = new Set([key, ...graph.neighbors(key)])
    const touching = new Set(graph.edgesOf(key))
    graph.selection.set({ nodes: [key] })
    graph.states.set('muted', {
      nodes: items.filter((item) => !near.has(item.id)).map((item) => item.id),
      edges: links.filter((link) => !touching.has(link.id)).map((link) => link.id),
    })
    graph.view.fit(near, { padding: 160 })
    await __bench.settle()
  })()`)
  await page.screenshot(join(out, 'neighborhood-dark.png'))
  await page.evaluate(`(async () => {
    const { graph } = window.bench
    graph.states.clear()
    graph.selection.clear()
    document.documentElement.setAttribute('data-theme', 'light')
    graph.view.fit()
    await __bench.settle()
  })()`)
  await page.screenshot(join(out, 'overview-light.png'))
  results.memory = await page.evaluate(
    '(performance.memory && Math.round(performance.memory.usedJSHeapSize / 1048576)) ?? null',
  )
  results.errors = page.errors
  writeFileSync(join(out, 'results.json'), `${JSON.stringify(results, null, 2)}\n`)

  const ms = (value) => `${value.toFixed(1)} ms`
  const row = (name, run) =>
    `| ${name} | ${ms(run.frame.median)} | ${ms(run.frame.p95)} | ${ms(run.frame.max)} | ${ms(run.cost.median)} | ${ms(run.cost.p95)} |`
  console.log(
    [
      `${results.nodes} nodes, ${results.edges} edges, ${results.renderer}`,
      `load: data ${ms(results.load.generate)}, mount ${ms(results.load.mount)}, first frame ${ms(results.load.firstFrame)}`,
      '',
      '| scenario | frame median | frame p95 | frame max | host median | host p95 |',
      '| --- | --- | --- | --- | --- | --- |',
      row('overview pan', results.overviewPan),
      row('zoom sweep', results.zoomSweep),
      row('close pan', results.closePan),
      '',
      `pick: first ${ms(results.pick.firstPickWithBuild)}, then median ${ms(results.pick.pick.median)}, p95 ${ms(results.pick.pick.p95)}`,
      `select ${ms(results.selectAndMute.select)}, mute ${ms(results.selectAndMute.mute)} (call ${ms(results.selectAndMute.muteCall)}), clear ${ms(results.selectAndMute.clear)}`,
      results.nodeDrag
        ? `node drag: host median ${ms(results.nodeDrag.cost.median)}, p95 ${ms(results.nodeDrag.cost.p95)}`
        : 'node drag: no node found',
      `heap ${results.memory} MB, errors ${results.errors.length}`,
      `results in ${out}`,
    ].join('\n'),
  )
  socket.close()
} finally {
  chrome.kill('SIGKILL')
  await server.close()
  rmSync(profile, { recursive: true, force: true })
}
