import type { Item, Node } from 'fumadocs-core/page-tree'
import { examples } from '../examples/catalog'
import { categories } from '../examples/categories'
import { messages } from '../messages'
import { showcases } from '../showcase/catalog'
import { changelog, npmPackage, repository, version } from '../site'
import { absoluteUrl, cleaned, siteOrigin } from './agent-text'
import { markdownDocs } from './markdown-docs'
import { source } from './source'

type DocsPage = ReturnType<typeof source.getPages>[number]

interface Section {
  readonly title: string
  readonly pages: DocsPage[]
}

export const markdownType = 'text/markdown; charset=utf-8'
export const textType = 'text/plain; charset=utf-8'
export const jsonType = 'application/json; charset=utf-8'

const origin = siteOrigin()
const entryPoint = '@bruno00o/graph'

export function markdownPath(page: DocsPage): string {
  return page.slugs.length === 0 ? '/docs/index.md' : `${page.url}.md`
}

export function markdownUrl(page: DocsPage): string {
  return absoluteUrl(markdownPath(page))
}

export function pageForMarkdown(splat: string | undefined): DocsPage | undefined {
  const slugs = (splat ?? '').split('/').filter((slug) => slug.length > 0)
  const last = slugs.pop()
  if (last === undefined || !last.endsWith('.md')) return undefined
  const name = last.slice(0, -'.md'.length)
  return source.getPage(name === 'index' ? slugs : [...slugs, name])
}

function nameOf(node: { readonly name?: unknown }): string {
  return typeof node.name === 'string' ? node.name : ''
}

function sectionTitle(name: string): string {
  return name.startsWith(entryPoint) ? `${messages.agents.apiPrefix}: ${name}` : name
}

function sectionsOf(): Section[] {
  const sections: Section[] = []
  const visit = (nodes: readonly Node[]): void => {
    for (const node of nodes) {
      if (node.type === 'separator') {
        sections.push({ title: sectionTitle(nameOf(node)), pages: [] })
      } else if (node.type === 'folder') {
        visit(node.index ? [node.index, ...node.children] : node.children)
      } else {
        const page = source.getNodePage(node as Item)
        if (page) sections.at(-1)?.pages.push(page)
      }
    }
  }
  for (const root of source.getPageTree().children) {
    if (root.type !== 'folder') continue
    sections.push({ title: nameOf(root), pages: [] })
    visit(root.index ? [root.index, ...root.children] : root.children)
  }
  return sections.filter((section) => section.pages.length > 0)
}

export function docsPages(): DocsPage[] {
  return sectionsOf().flatMap((section) => section.pages)
}

async function bodyOf(page: DocsPage): Promise<string> {
  const text = await markdownDocs.get(page.path)?.getText('processed')
  return cleaned(text ?? '').trim()
}

export async function pageMarkdown(page: DocsPage): Promise<string> {
  const title = page.data.title ?? page.slugs.join('/')
  const description = page.data.description ?? ''
  const lines = [`# ${title}`, '']
  if (description) lines.push(`> ${description}`, '')
  lines.push(`${messages.agents.pageLabel}: ${absoluteUrl(page.url)}`, '', await bodyOf(page))
  return `${lines.join('\n').trimEnd()}\n`
}

async function summaryOf(): Promise<string> {
  const overview = source.getPage([])
  if (!overview) return messages.siteDescription
  const body = await bodyOf(overview)
  const paragraph = body.split(/\n\s*\n/).find((block) => /^[A-Za-z`]/.test(block.trim()))
  return (paragraph ?? messages.siteDescription).replace(/\s*\n\s*/g, ' ').trim()
}

function entry(title: string, url: string, description: string): string {
  const label = title.replace(/([[\]])/g, '\\$1')
  return description ? `- [${label}](${url}): ${description}` : `- [${label}](${url})`
}

export async function llmsIndex(): Promise<string> {
  const lines = [`# ${messages.siteTitle}`, '', `> ${await summaryOf()}`, '']
  lines.push(messages.agents.versionNote(version), '')
  lines.push(`## ${messages.agents.fullTitle}`, '')
  lines.push(
    entry(messages.agents.fullName, absoluteUrl('llms-full.txt'), messages.agents.fullText),
    '',
  )
  for (const section of sectionsOf()) {
    lines.push(`## ${section.title}`, '')
    for (const page of section.pages) {
      lines.push(entry(page.data.title ?? '', markdownUrl(page), page.data.description ?? ''))
    }
    lines.push('')
  }
  for (const category of categories) {
    const inCategory = examples.filter((example) => example.category === category.id)
    if (inCategory.length === 0) continue
    lines.push(`## ${messages.agents.examplesPrefix}: ${category.title}`, '')
    lines.push(category.description, '')
    for (const example of inCategory) {
      lines.push(entry(example.title, absoluteUrl(`examples/${example.slug}`), example.description))
    }
    lines.push('')
  }
  lines.push(`## ${messages.agents.optional}`, '')
  for (const app of showcases) {
    lines.push(entry(app.title, absoluteUrl(`showcase/${app.slug}`), app.description))
  }
  lines.push(
    entry(messages.nav.benchmark, absoluteUrl('benchmark'), messages.agents.benchmarkText),
    entry(messages.agents.manifestName, absoluteUrl('ard.json'), messages.agents.manifestText),
    entry(messages.changelog, changelog, messages.agents.changelogText),
    entry(messages.github, repository, messages.agents.repositoryText),
    entry(messages.npm, npmPackage, messages.agents.npmText),
    '',
  )
  return `${lines.join('\n').trimEnd()}\n`
}

export async function llmsFull(): Promise<string> {
  const head = [`# ${messages.siteTitle}`, '', `> ${await summaryOf()}`].join('\n')
  const pages = await Promise.all(docsPages().map((page) => pageMarkdown(page)))
  return `${[head, ...pages.map((page) => page.trimEnd())].join('\n\n')}\n`
}

export interface ArdEntry {
  readonly identifier: string
  readonly displayName: string
  readonly type: string
  readonly url: string
  readonly description: string
  readonly tags: readonly string[]
  readonly version: string
  readonly representativeQueries: readonly string[]
}

export interface ArdManifest {
  readonly specVersion: '1.0'
  readonly host: { readonly displayName: string; readonly documentationUrl: string }
  readonly entries: readonly ArdEntry[]
}

export function ardManifest(): ArdManifest {
  const publisher = new URL(origin).hostname
  const common = { type: 'text/markdown', version, tags: messages.agents.tags } as const
  return {
    specVersion: '1.0',
    host: { displayName: messages.siteTitle, documentationUrl: absoluteUrl('docs') },
    entries: [
      {
        ...common,
        identifier: `urn:air:${publisher}:graph:docs-full`,
        displayName: messages.agents.fullName,
        url: absoluteUrl('llms-full.txt'),
        description: messages.agents.fullText,
        representativeQueries: messages.agents.fullQueries,
      },
      {
        ...common,
        identifier: `urn:air:${publisher}:graph:docs-index`,
        displayName: messages.agents.indexName,
        url: absoluteUrl('llms.txt'),
        description: messages.agents.indexText,
        representativeQueries: messages.agents.indexQueries,
      },
    ],
  }
}
