import { existsSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { browserArgs, docsExamples, docsSite, install, root, run, serve } from './harness.mjs'

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    build: { type: 'boolean', default: true },
    quality: { type: 'string', default: '0.8' },
  },
})

const stage = { width: 960, height: 600 }
const image = { width: 640, height: 400 }
const themes = [
  { scheme: 'light', file: 'thumbnail.webp' },
  { scheme: 'dark', file: 'thumbnail-dark.webp' },
]
const captureStyle = `
  .frame-stage {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: ${stage.width}px !important;
    height: ${stage.height}px !important;
    z-index: 2147483647 !important;
  }
  .example-status { display: none !important; }
`
const hidePanels = `
  .example-actions, .example-panel { display: none !important; }
`

const all = await docsExamples()
const unknown = positionals.filter((slug) => !all.some((example) => example.slug === slug))
if (unknown.length > 0) throw new Error(`No docs example named ${unknown.join(', ')}`)
const wanted =
  positionals.length > 0 ? all.filter((example) => positionals.includes(example.slug)) : all

if (options.build || !existsSync(docsSite)) run('pnpm', ['docs:build'])

function encode({ data, width, height, quality }) {
  return (async () => {
    const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality })
    const view = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let index = 0; index < view.length; index += 0x8000) {
      binary += String.fromCharCode(...view.subarray(index, index + 0x8000))
    }
    return btoa(binary)
  })()
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready.then(() => window.__harness.frames(3)))
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.evaluate(() => window.__harness.frames(3))
  await page.waitForTimeout(500)
}

async function capture(browser, encoder, origin, example) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })
  await context.addInitScript(install)
  const stageStyle = example.meta.thumbnail?.panels ? captureStyle : captureStyle + hidePanels
  await context.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = css
      document.head.append(style)
    })
  }, stageStyle)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(`${origin}/examples/${example.slug}`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__harness.ready(), null, {
      timeout: 60000,
      polling: 100,
    })
    if (!(await page.evaluate((limit) => window.__harness.settle(limit), 45000))) {
      throw new Error('layout did not settle')
    }
    const written = []
    for (const theme of themes) {
      await page.emulateMedia({ colorScheme: theme.scheme, reducedMotion: 'reduce' })
      await page.waitForFunction(
        (dark) => document.documentElement.classList.contains('dark') === dark,
        theme.scheme === 'dark',
      )
      await settle(page)
      const png = await page.screenshot({ clip: { x: 0, y: 0, ...stage } })
      const data = await encoder.evaluate(encode, {
        data: png.toString('base64'),
        ...image,
        quality: Number(options.quality),
      })
      const file = join(example.folder, theme.file)
      const bytes = Buffer.from(data, 'base64')
      writeFileSync(file, bytes)
      written.push(`${relative(root, file)} ${(bytes.length / 1024).toFixed(1)} KB`)
    }
    if (errors.length > 0) throw new Error(errors[0])
    return written
  } finally {
    await context.close()
  }
}

const { server, origin } = await serve(docsSite)
const browser = await chromium.launch({ args: browserArgs('chromium') })
let failed = 0
try {
  const encoder = await browser.newPage()
  for (const example of wanted) {
    try {
      const written = await capture(browser, encoder, origin, example)
      console.log(written.join('\n'))
    } catch (error) {
      failed++
      console.log(`${example.slug}: ${String(error?.message ?? error).split('\n')[0]}`)
    }
  }
} finally {
  await browser.close()
  server.close()
}
process.exitCode = failed > 0 ? 1 : 0
