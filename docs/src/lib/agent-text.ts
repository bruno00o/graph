import { findExample } from '../examples/catalog'
import { messages } from '../messages'

export function siteOrigin(): string {
  return import.meta.env.DOCS_ORIGIN.replace(/\/+$/, '')
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

function targetOf(target: string): string {
  const [path = '', hash] = target.split('#')
  const mapped =
    path === '/docs'
      ? '/docs/index.md'
      : path.startsWith('/docs/') && !path.endsWith('.md')
        ? `${path.replace(/\/$/, '')}.md`
        : path
  return `${absoluteUrl(mapped)}${hash === undefined ? '' : `#${hash}`}`
}

function prose(segment: string): string {
  return segment
    .replace(/\]\((\/[^)\s]*)\)/g, (_, target: string) => `](${targetOf(target)})`)
    .replace(/<LiveExample\s+slug="([^"]+)"[^>]*\/>/g, (_, slug: string) => {
      const example = findExample(slug)
      return example
        ? `[${messages.agents.liveExample}: ${example.title}](${absoluteUrl(`examples/${slug}`)})`
        : ''
    })
    .replace(
      /[ \t]*<Card\s+title="([^"]*)"\s+href="([^"]*)"\s*(?:\/>|>\s*([\s\S]*?)\s*<\/Card>)/g,
      (_, title: string, href: string, text: string | undefined) => {
        const url = href.startsWith('/') ? targetOf(href) : href
        return text ? `- [${title}](${url}): ${text.replace(/\s+/g, ' ')}` : `- [${title}](${url})`
      },
    )
    .replace(/<\/?Cards>\n?/g, '')
    .replace(
      /<Callout(?:\s+title="([^"]*)")?[^>]*>\n?([\s\S]*?)\n?<\/Callout>/g,
      (_, title: string | undefined, text: string) => {
        const lines = `${title ? `**${title}.** ` : ''}${text}`.split('\n')
        return lines.map((line) => `> ${line}`.trimEnd()).join('\n')
      },
    )
}

function compactRow(line: string): string {
  if (!line.startsWith('|')) return line
  return /^\|[\s:|-]+\|$/.test(line)
    ? line.replace(/-{3,}/g, '---').replace(/ {2,}/g, ' ')
    : line.replace(/ {2,}/g, ' ')
}

export function cleaned(markdown: string): string {
  const out: string[] = []
  let segment: string[] = []
  let fence = ''
  const flush = (): void => {
    if (segment.length === 0) return
    out.push(prose(segment.map(compactRow).join('\n')))
    segment = []
  }
  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      out.push(line)
      if (marker?.startsWith(fence) && marker.length >= fence.length) fence = ''
    } else if (marker) {
      flush()
      fence = marker
      out.push(line)
    } else {
      segment.push(line)
    }
  }
  flush()
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}
