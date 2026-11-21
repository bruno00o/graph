import { messages } from '../messages'
import { npmPackage, repository, version } from '../site'
import { type PreviewImage, trimmed } from './og'
import { absoluteUrl } from './origin'

interface JsonLdNode {
  readonly '@type': string
  readonly [key: string]: unknown
}

export interface JsonLd {
  readonly '@context': string
  readonly '@graph': readonly JsonLdNode[]
}

export interface Crumb {
  readonly name: string
  readonly url: string
}

export interface PageSeo {
  readonly path: string
  readonly title: string
  readonly description: string
  readonly type?: 'website' | 'article'
  readonly image?: PreviewImage | null
  readonly imageAlt?: string
  readonly data?: readonly JsonLd[]
}

interface Meta {
  readonly name?: string
  readonly property?: string
  readonly content?: string
  readonly title?: string
  readonly 'script:ld+json'?: JsonLd
}

interface Link {
  readonly rel: string
  readonly href: string
}

const license = 'https://spdx.org/licenses/MIT.html'

export function pageUrl(path: string): string {
  const page = trimmed(path)
  return absoluteUrl(page === '' ? '' : `${page}/`)
}

function websiteId(): string {
  return `${pageUrl('/')}#website`
}

function softwareId(): string {
  return `${pageUrl('/')}#software`
}

export function siteData(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId(),
        name: messages.siteTitle,
        url: pageUrl('/'),
        description: messages.siteDescription,
        inLanguage: messages.seo.language,
      },
      {
        '@type': 'SoftwareSourceCode',
        '@id': softwareId(),
        name: messages.siteTitle,
        description: messages.siteDescription,
        url: pageUrl('/'),
        codeRepository: repository,
        license,
        programmingLanguage: messages.seo.programmingLanguage,
        version,
        sameAs: [npmPackage],
      },
    ],
  }
}

export function articleData(page: PageSeo, crumbs: readonly Crumb[]): JsonLd {
  const url = pageUrl(page.path)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: page.title,
        description: page.description,
        url,
        mainEntityOfPage: url,
        inLanguage: messages.seo.language,
        isPartOf: { '@type': 'WebSite', '@id': websiteId(), name: messages.siteTitle },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: crumb.name,
          item: crumb.url,
        })),
      },
    ],
  }
}

export function pageHead(page: PageSeo): { meta: Meta[]; links: Link[] } {
  const url = pageUrl(page.path)
  const { image } = page
  const alt = page.imageAlt ?? messages.seo.previewAlt(page.title)
  const meta: Meta[] = [
    { title: page.title },
    { name: 'description', content: page.description },
    { property: 'og:site_name', content: messages.siteTitle },
    { property: 'og:locale', content: messages.seo.locale },
    { property: 'og:type', content: page.type ?? 'website' },
    { property: 'og:title', content: page.title },
    { property: 'og:description', content: page.description },
    { property: 'og:url', content: url },
    { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    { name: 'twitter:title', content: page.title },
    { name: 'twitter:description', content: page.description },
  ]
  if (image) {
    meta.push(
      { property: 'og:image', content: image.url },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: String(image.width) },
      { property: 'og:image:height', content: String(image.height) },
      { property: 'og:image:alt', content: alt },
      { name: 'twitter:image', content: image.url },
      { name: 'twitter:image:alt', content: alt },
    )
  }
  for (const data of page.data ?? []) meta.push({ 'script:ld+json': data })
  return { meta, links: [{ rel: 'canonical', href: url }] }
}
