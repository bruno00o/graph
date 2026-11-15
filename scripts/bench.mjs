import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'

const { values: options } = parseArgs({
  options: {
    nodes: { type: 'string' },
    edges: { type: 'string' },
    layout: { type: 'string' },
    out: { type: 'string', default: 'bench-results' },
    vsync: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    params: { type: 'string', default: '' },
    port: { type: 'string', default: '5199' },
    'debug-port': { type: 'string', default: '9361' },
  },
})

const nodeCount = options.nodes ?? (options.layout ? '80000' : '50000')
const edgeCount = options.edges ?? (options.layout ? '133000' : '100000')
const width = 1280
const height = 800
const scale = 2
const debugPort = Number(options['debug-port'])
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
  others: `(async () => {
    const { graph, items, nextFrame } = window.bench
    const key = items[0].id
    const near = { nodes: [key, ...graph.neighbors(key)], edges: graph.edgesOf(key) }
    graph.view.fit()
    await __bench.settle()
    const t0 = performance.now()
    graph.states.set('near', near)
    const call = performance.now() - t0
    await nextFrame()
    await nextFrame()
    const set = performance.now() - t0
    const start = graph.view.get()
    const pan = await __bench.drive(240, (i) => graph.view.set({ ...start, x: start.x + Math.sin(i / 20) * 200 / start.zoom }))
    const t1 = performance.now()
    graph.states.clear('near')
    await nextFrame()
    await nextFrame()
    return { call, set, pan, clear: performance.now() - t1 }
  })()`,
  reorder: `(async () => {
    const { graph, items, define, nextFrame } = window.bench
    graph.view.fit()
    await __bench.settle()
    const update = async (list) => {
      const t = performance.now()
      graph.update({ definition: define(list) })
      await nextFrame()
      await nextFrame()
      return performance.now() - t
    }
    const ranked = items.map((item, index) => ({ ...item, rank: (index * 7919) % 1000 }))
    const all = await update(ranked)
    await __bench.settle()
    const one = ranked.slice()
    one[1] = { ...one[1], rank: -1 }
    const single = await update(one)
    return { all, single }
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

async function benchRender(page, out) {
  const results = {
    date: new Date().toISOString(),
    nodes: Number(nodeCount),
    edges: Number(edgeCount),
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
  results.others = await page.evaluate(scenarios.others)
  if (new URLSearchParams(options.params).has('order')) {
    results.reorder = await page.evaluate(scenarios.reorder)
  }
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
    graph.view.fit({ nodes: near, padding: 160 })
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
      row('overview pan, others', results.others.pan),
      '',
      `pick: first ${ms(results.pick.firstPickWithBuild)}, then median ${ms(results.pick.pick.median)}, p95 ${ms(results.pick.pick.p95)}`,
      `select ${ms(results.selectAndMute.select)}, mute ${ms(results.selectAndMute.mute)} (call ${ms(results.selectAndMute.muteCall)}), clear ${ms(results.selectAndMute.clear)}`,
      `others: set ${ms(results.others.set)} (call ${ms(results.others.call)}), clear ${ms(results.others.clear)}`,
      ...(results.reorder
        ? [`reorder: all ${ms(results.reorder.all)}, one ${ms(results.reorder.single)}`]
        : []),
      results.nodeDrag
        ? `node drag: host median ${ms(results.nodeDrag.cost.median)}, p95 ${ms(results.nodeDrag.cost.p95)}`
        : 'node drag: no node found',
      `heap ${results.memory} MB, errors ${results.errors.length}`,
      `results in ${out}`,
    ].join('\n'),
  )
}

const editHelpers = `
  window.__edit = {
    send(type, x, y, buttons) {
      const canvas = window.bench.graph.element.querySelector('canvas')
      const rect = canvas.getBoundingClientRect()
      canvas.dispatchEvent(new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons,
        clientX: rect.left + x,
        clientY: rect.top + y,
        bubbles: true,
        cancelable: true,
        composed: true,
      }))
    },
    shapeAt(wanted) {
      const { graph } = window.bench
      const { width, height } = graph.store.get()
      for (let ring = 0; ring < 60; ring++) {
        for (let turn = 0; turn < 24; turn++) {
          const angle = (turn / 24) * Math.PI * 2
          const x = Math.round(width / 2 + Math.cos(angle) * ring * 6)
          const y = Math.round(height / 2 + Math.sin(angle) * ring * 6)
          const hit = graph.pick({ x, y })
          if (hit?.kind === 'shape' && (wanted ? hit.key === wanted : hit.key !== 'big')) {
            return { x, y, key: hit.key }
          }
        }
      }
      return null
    },
    async pending() {
      const { editor, nextFrame } = window.bench
      for (let index = 0; index < 600 && editor.store.state.pending.length > 0; index++) {
        await nextFrame()
      }
      await nextFrame()
      __bench.finish()
    },
    async gesture(start, path, frames) {
      const { frameCosts, nextFrame } = window.bench
      this.send('pointerdown', start.x, start.y, 1)
      this.send('pointermove', start.x + 8, start.y, 1)
      await nextFrame()
      await nextFrame()
      const run = await __bench.drive(frames, (i) => {
        const [x, y] = path(i)
        this.send('pointermove', start.x + x, start.y + y, 1)
      })
      const [x, y] = path(frames)
      const from = frameCosts.length
      const t0 = performance.now()
      this.send('pointerup', start.x + x, start.y + y, 0)
      const up = performance.now() - t0
      await this.pending()
      const costs = frameCosts.slice(from)
      return {
        run,
        up,
        release: performance.now() - t0,
        releaseHost: costs.reduce((sum, value) => sum + value, 0),
        releaseWorst: Math.max(0, ...costs),
        releaseFrames: costs.length,
      }
    },
    async move(count) {
      const { graph, zones } = window.bench
      graph.selection.clear()
      graph.view.fit()
      await __bench.settle()
      const hit = this.shapeAt(null)
      if (!hit) return null
      const others = zones.map((zone) => zone.id).filter((key) => key !== hit.key)
      if (count > 1) {
        graph.selection.set({ nodes: [], edges: [], shapes: [hit.key, ...others.slice(0, count - 1)] })
        await __bench.settle()
      }
      const result = await this.gesture(
        hit,
        (i) => [8 + Math.sin(i / 10) * 40 + i * 0.25, Math.cos(i / 10) * 30 - 30],
        120,
      )
      graph.selection.clear()
      await __bench.settle()
      return result
    },
    async big(reshape) {
      const { graph, live } = window.bench
      graph.selection.clear()
      graph.view.fit({ shapes: ['big'] })
      await __bench.settle()
      graph.selection.set({ nodes: [], edges: [], shapes: ['big'] })
      await __bench.settle()
      let start = null
      if (reshape) {
        const ring = live.rows.get('big').geometry.rings[0]
        const [x, y] = ring[Math.floor(ring.length / 8)]
        const point = graph.view.toScreen({ x, y })
        start = { x: Math.round(point.x), y: Math.round(point.y) }
        this.send('pointermove', start.x, start.y, 0)
        await __bench.settle()
      } else start = this.shapeAt('big')
      if (!start) return null
      const result = await this.gesture(start, (i) => [8 + i * 0.5, i * 0.25], 30)
      graph.selection.clear()
      await __bench.settle()
      return result
    },
    async pickAfter(times) {
      const { live, zones, graph, nextFrame } = window.bench
      graph.selection.clear()
      graph.view.fit()
      await __bench.settle()
      const hit = this.shapeAt(null)
      if (!hit) return null
      const durations = []
      for (let i = 0; i < times; i++) {
        const row = live.rows.get(zones[(i * 53) % zones.length].id)
        const ring = row.geometry.rings[0]
        const [x, y] = ring[0]
        const moved = [[x + 0.5, y + 0.5], ...ring.slice(1)]
        live.write([{ type: 'update', key: row.id, value: { ...row, geometry: { rings: [moved] } } }])
        await nextFrame()
        await nextFrame()
        const start = performance.now()
        const found = graph.pick({ x: hit.x, y: hit.y })
        durations.push(performance.now() - start)
        if (found?.kind !== 'shape') return null
      }
      return __bench.stats(durations)
    },
    async remote(frames) {
      const { live, zones } = window.bench
      const { graph } = window.bench
      graph.selection.clear()
      graph.view.fit()
      await __bench.settle()
      return __bench.drive(frames, (i) => {
        const row = live.rows.get(zones[(i * 37) % zones.length].id)
        const ring = row.geometry.rings[0]
        const [x, y] = ring[0]
        const moved = [[x + 0.5, y + 0.5], ...ring.slice(1)]
        live.write([{ type: 'update', key: row.id, value: { ...row, geometry: { rings: [moved] } } }])
      })
    },
  }
`

async function benchEdit(page, out) {
  await page.evaluate(editHelpers)
  await page.evaluate('__bench.settle()')
  const results = {
    date: new Date().toISOString(),
    params: options.params,
    renderer: await page.evaluate(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
    })()`),
    load: await page.evaluate('window.bench.timings'),
  }
  const repeated = async (expression) => {
    const runs = []
    for (let time = 0; time < 5; time++) runs.push(await page.evaluate(expression))
    if (runs.some((run) => !run)) return null
    const median = (key) => {
      const values = runs.map((run) => run[key]).sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    }
    return {
      run: runs[0].run,
      up: median('up'),
      release: median('release'),
      releaseHost: median('releaseHost'),
      releaseWorst: median('releaseWorst'),
      releaseFrames: median('releaseFrames'),
      runs,
    }
  }
  results.overviewPan = await page.evaluate(scenarios.overviewPan)
  results.remote = await page.evaluate('__edit.remote(120)')
  results.pickAfter = await page.evaluate('__edit.pickAfter(40)')
  for (const count of [1, 100, 1000]) {
    results[`move${count}`] = await repeated(`__edit.move(${count})`)
  }
  await page.screenshot(join(out, 'moved.png'))
  results.translateBig = await repeated('__edit.big(false)')
  results.reshapeBig = await repeated('__edit.big(true)')
  results.errors = page.errors
  writeFileSync(join(out, 'edit.json'), `${JSON.stringify(results, null, 2)}\n`)
  const ms = (value) => `${value.toFixed(1)} ms`
  const row = (name, run) =>
    run
      ? `| ${name} | ${ms(run.frame.median)} | ${ms(run.frame.p95)} | ${ms(run.cost.median)} | ${ms(run.cost.p95)} |`
      : `| ${name} | no shape found | | | |`
  const release = (name, run) =>
    run
      ? `| ${name} | ${ms(run.up)} | ${ms(run.release)} | ${ms(run.releaseHost)} | ${ms(run.releaseWorst)} |`
      : `| ${name} | no shape found | | | |`
  console.log(
    [
      `${options.params}, ${results.renderer}`,
      `load: data ${ms(results.load.generate)}, mount ${ms(results.load.mount)}, first frame ${ms(results.load.firstFrame)}`,
      '',
      '| scenario | frame median | frame p95 | host median | host p95 |',
      '| --- | --- | --- | --- | --- |',
      row('overview pan', results.overviewPan),
      row('remote update', results.remote),
      row('move 1 shape', results.move1?.run),
      row('move 100 shapes', results.move100?.run),
      row('move 1,000 shapes', results.move1000?.run),
      row('move 5,000 points', results.translateBig?.run),
      row('reshape 5,000 points', results.reshapeBig?.run),
      '',
      results.pickAfter
        ? `first pick of a shape after a remote update: median ${ms(results.pickAfter.median)}, p95 ${ms(results.pickAfter.p95)}`
        : 'first pick of a shape after a remote update: no shape found',
      '',
      '| release (median of 5) | pointer up | until drawn | host | worst frame |',
      '| --- | --- | --- | --- | --- |',
      release('1 shape', results.move1),
      release('100 shapes', results.move100),
      release('1,000 shapes', results.move1000),
      release('5,000 points moved', results.translateBig),
      release('5,000 points reshaped', results.reshapeBig),
      '',
      `errors ${results.errors.length}, results in ${out}`,
    ].join('\n'),
  )
}

async function benchTime(page, out) {
  await page.evaluate('__bench.settle()')
  const results = {
    date: new Date().toISOString(),
    params: options.params,
    renderer: await page.evaluate(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
    })()`),
    load: await page.evaluate('window.bench.timings'),
  }
  const slide = (count, span, width) => `(async () => {
    const { graph, history } = window.bench
    graph.view.fit()
    await __bench.settle()
    const start = history.start
    return __bench.drive(${count}, (i) => {
      const at = start + (i + 1) * ${span}
      graph.time.set({ start: at, end: at + ${width} })
    })
  })()`
  results.dayStep = await page.evaluate(slide(240, 86_400_000, 90 * 86_400_000))
  results.weekStep = await page.evaluate(slide(150, 7 * 86_400_000, 30 * 86_400_000))
  results.moment = await page.evaluate(slide(240, 3 * 86_400_000, 0))
  results.jump = await page.evaluate(`(async () => {
    const { graph, history } = window.bench
    await __bench.settle()
    const span = history.end - history.start
    return __bench.drive(60, (i) => {
      const at = history.start + (i % 2 === 0 ? 0.2 : 0.8) * span
      graph.time.set({ start: at, end: at + 30 * 86_400_000 })
    })
  })()`)
  results.errors = page.errors
  writeFileSync(join(out, 'time.json'), `${JSON.stringify(results, null, 2)}\n`)
  const ms = (value) => `${value.toFixed(2)} ms`
  const row = (name, run) =>
    `| ${name} | ${ms(run.frame.median)} | ${ms(run.frame.p95)} | ${ms(run.cost.median)} | ${ms(run.cost.p95)} |`
  console.log(
    [
      `${options.params}, ${results.renderer}`,
      `load: data ${ms(results.load.generate)}, mount ${ms(results.load.mount)}, first frame ${ms(results.load.firstFrame)}, timeline ${ms(results.load.timeline)}`,
      '',
      '| scenario | frame median | frame p95 | host median | host p95 |',
      '| --- | --- | --- | --- | --- |',
      row('window of 90 days, step of a day', results.dayStep),
      row('window of 30 days, step of a week', results.weekStep),
      row('moment, step of 3 days', results.moment),
      row('jump of 60 % of the extent', results.jump),
      '',
      `errors ${results.errors.length}, results in ${out}`,
    ].join('\n'),
  )
}

async function benchHistory(page, out) {
  await page.evaluate('__bench.settle()')
  await page.send('HeapProfiler.enable')
  await page.send('HeapProfiler.collectGarbage')
  const heap = await page.send('Runtime.getHeapUsage')
  const results = {
    date: new Date().toISOString(),
    params: options.params,
    renderer: await page.evaluate(`(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null
    })()`),
    load: await page.evaluate('window.bench.timings'),
    heap: heap.result ?? null,
  }
  const step = (count, span, from) => `(async () => {
    const { graph, journalStart } = window.bench
    graph.view.fit()
    await __bench.settle()
    const start = journalStart + ${from}
    return __bench.drive(${count}, (i) => {
      const at = start + (i + 1) * ${span}
      graph.time.set({ start: at, end: at })
    })
  })()`
  results.hourForward = await page.evaluate(step(240, 3_600_000, 10 * 86_400_000))
  results.hourBack = await page.evaluate(step(240, -3_600_000, 20 * 86_400_000))
  results.dayForward = await page.evaluate(step(29, 86_400_000, 0))
  results.window = await page.evaluate(`(async () => {
    const { graph, journalStart } = window.bench
    await __bench.settle()
    return __bench.drive(60, (i) => {
      const end = journalStart + (i % 2 === 0 ? 25 : 5) * 86_400_000
      graph.time.set({ start: journalStart, end })
    })
  })()`)
  results.renew = await page.evaluate(`(async () => {
    const { graph, nextFrame, attachJournal } = window.bench
    if (!attachJournal) return null
    const at = window.bench.journalStart + 15 * 86_400_000
    graph.time.set({ start: at, end: at })
    await __bench.settle()
    const runs = []
    for (let time = 0; time < 3; time++) {
      const definition = window.bench.renewHistory()
      const t0 = performance.now()
      graph.update({ definition })
      graph.count()
      const applied = performance.now() - t0
      await nextFrame()
      __bench.finish()
      runs.push({ applied, drawn: performance.now() - t0 })
      await __bench.settle()
    }
    return runs
  })()`)
  results.errors = page.errors
  writeFileSync(join(out, 'history.json'), `${JSON.stringify(results, null, 2)}\n`)
  const ms = (value) => `${value.toFixed(2)} ms`
  const row = (name, run) =>
    `| ${name} | ${ms(run.frame.median)} | ${ms(run.frame.p95)} | ${ms(run.cost.median)} | ${ms(run.cost.p95)} |`
  console.log(
    [
      `${options.params}, ${results.renderer}`,
      `load: data ${ms(results.load.generate)}, mount ${ms(results.load.mount)}, first frame ${ms(results.load.firstFrame)}, heap ${Object.entries(
        results.heap ?? {},
      )
        .map(([name, bytes]) => `${name} ${(bytes / 2 ** 20).toFixed(1)} MiB`)
        .join(', ')}`,
      '',
      '| scenario | frame median | frame p95 | host median | host p95 |',
      '| --- | --- | --- | --- | --- |',
      row('hour forward', results.hourForward),
      row('hour back', results.hourBack),
      row('day forward', results.dayForward),
      row('window 5 and 25 days', results.window),
      '',
      results.renew
        ? `new history: ${results.renew.map((run) => `${ms(run.applied)} applied, ${ms(run.drawn)} drawn`).join('; ')}`
        : 'no history attached',
      `errors ${results.errors.length}, results in ${out}`,
    ].join('\n'),
  )
}

async function benchLayout(page, out) {
  await page.evaluate(`new Promise((done) => {
    const check = () => (window.bench.layoutRuns.length > 0 ? done() : setTimeout(check, 20))
    check()
  })`)
  await page.evaluate(helpers)
  await page.evaluate('__bench.settle()')
  const rerun = await page.evaluate(`(async () => {
    const { graph, frameCosts, layoutRuns } = window.bench
    const from = frameCosts.length
    await graph.layout.run()
    graph.view.fit()
    return { run: layoutRuns.at(-1), cost: __bench.stats(frameCosts.slice(from)) }
  })()`)
  await page.evaluate('__bench.settle()')
  await page.screenshot(join(out, 'layout-dark.png'))
  const first = await page.evaluate('window.bench.layoutRuns[0]')
  const results = {
    date: new Date().toISOString(),
    nodes: Number(nodeCount),
    edges: Number(edgeCount),
    engine: options.layout,
    first,
    rerun,
    errors: page.errors,
  }
  writeFileSync(join(out, 'layout.json'), `${JSON.stringify(results, null, 2)}\n`)
  const ms = (value) => `${value.toFixed(0)} ms`
  console.log(
    [
      `${nodeCount} nodes, ${edgeCount} edges, force layout on ${options.layout}`,
      `first run ${ms(first.ms)}, rerun ${ms(rerun.run.ms)}`,
      `host per frame during the rerun: median ${rerun.cost.median.toFixed(1)} ms, p95 ${rerun.cost.p95.toFixed(1)} ms, ${rerun.cost.count} frames`,
      `errors ${page.errors.length}, results in ${out}`,
    ].join('\n'),
  )
}

const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { port: Number(options.port), strictPort: false },
})
await server.listen()
const base = server.resolvedUrls?.local[0] ?? `http://localhost:${options.port}/`
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
  const layout = options.layout ? `&layout=${options.layout}` : ''
  const extra = options.params ? `&${options.params}` : ''
  const url = `${base}bench/?nodes=${nodeCount}&edges=${edgeCount}${layout}${extra}`
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

  if (options.layout) await benchLayout(page, out)
  else if (new URLSearchParams(options.params).has('edit')) await benchEdit(page, out)
  else if (new URLSearchParams(options.params).has('history')) await benchHistory(page, out)
  else if (new URLSearchParams(options.params).has('time')) await benchTime(page, out)
  else await benchRender(page, out)
  socket.close()
} finally {
  chrome.kill('SIGKILL')
  await server.close()
  rmSync(profile, { recursive: true, force: true })
}
