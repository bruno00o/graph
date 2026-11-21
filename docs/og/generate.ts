import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { readFont } from '@bruno00o/graph/headless'
import { renderAsync } from '@resvg/resvg-js'
import sharp from 'sharp'
import { ogPath } from '../src/lib/og'
import { messages } from '../src/messages'
import { drawCard, type Fonts } from './card'
import { seedOf } from './sample'
import { unwrapWoff } from './woff'

export interface Generated {
  readonly drawn: number
  readonly kept: number
  readonly bytes: number
  readonly milliseconds: number
}

interface Page {
  readonly path: string
  readonly title: string
  readonly description: string
}

const require = createRequire(import.meta.url)
const fontFiles = {
  title: ['@fontsource/atkinson-hyperlegible-next', 'atkinson-hyperlegible-next-latin-700-normal'],
  body: ['@fontsource/atkinson-hyperlegible-next', 'atkinson-hyperlegible-next-latin-400-normal'],
  mono: ['@fontsource/atkinson-hyperlegible-mono', 'atkinson-hyperlegible-mono-latin-600-normal'],
} as const

function decoded(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function htmlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return ['assets', 'og'].includes(entry.name) ? [] : htmlFiles(path)
    return entry.name.endsWith('.html') && entry.name !== '404.html' ? [path] : []
  })
}

function metaOf(html: string, key: string): string {
  const head = html.slice(0, html.indexOf('</head>'))
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/g)) {
    if (tag.includes(`property="${key}"`) || tag.includes(`name="${key}"`)) {
      return decoded(/content="([^"]*)"/.exec(tag)?.[1] ?? '')
    }
  }
  return ''
}

function pagesOf(site: string, origin: string): Page[] {
  return htmlFiles(site)
    .map((file) => {
      const html = readFileSync(file, 'utf8')
      const url = metaOf(html, 'og:url')
      if (!url.startsWith(origin))
        throw new Error(`${relative(site, file)}: no og:url under ${origin}`)
      return {
        path: url.slice(origin.length).replace(/^\/+|\/+$/g, ''),
        title: metaOf(html, 'og:title'),
        description: metaOf(html, 'og:description'),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function labelOf(path: string): string {
  if (path === '') return messages.siteTitle
  if (path.startsWith('docs/api')) return messages.nav.api
  if (path.startsWith('docs')) return messages.nav.docs
  if (path.startsWith('examples')) return messages.nav.examples
  if (path.startsWith('showcase')) return messages.nav.showcase
  return messages.nav.benchmark
}

function loadFonts(): { readonly fonts: Fonts; readonly files: string[] } {
  const directory = mkdtempSync(join(tmpdir(), 'graph-og-fonts-'))
  const read = (name: keyof Fonts) => {
    const [pack, file] = fontFiles[name]
    const bytes = unwrapWoff(readFileSync(require.resolve(`${pack}/files/${file}.woff`)))
    const path = join(directory, `${file}.ttf`)
    writeFileSync(path, bytes)
    return { path, face: readFont(bytes) }
  }
  const title = read('title')
  const body = read('body')
  const mono = read('mono')
  return {
    fonts: { title: title.face, body: body.face, mono: mono.face },
    files: [title.path, body.path, mono.path],
  }
}

async function encode(svg: string, files: string[]): Promise<Buffer> {
  const image = await renderAsync(svg, { font: { loadSystemFonts: false, fontFiles: files } })
  return sharp(image.asPng())
    .png({ compressionLevel: 9, palette: true, colours: 64, effort: 7 })
    .toBuffer()
}

export async function generate(site: string, origin: string): Promise<Generated> {
  const started = performance.now()
  const { fonts, files } = loadFonts()
  const pages = pagesOf(site, origin)
  const pending = pages.filter((page) => !existsSync(join(site, ogPath(page.path))))
  const kept = pages.length - pending.length
  let bytes = 0
  const queue = [...pending]
  const worker = async (): Promise<void> => {
    for (let page = queue.shift(); page; page = queue.shift()) {
      const home = page.path === ''
      const svg = await drawCard(
        {
          label: labelOf(page.path),
          title: home ? messages.home.title : (page.title.split(' | ')[0] ?? page.title),
          description: home ? messages.home.lead : page.description,
          footer: home ? messages.home.install : messages.siteTitle,
          seed: seedOf(page.path),
        },
        fonts,
      )
      const png = await encode(svg, files)
      const file = join(site, ogPath(page.path))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, png)
      bytes += png.length
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return { drawn: pending.length, kept, bytes, milliseconds: performance.now() - started }
}
