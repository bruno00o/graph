import type { BaseLayoutProps, LinkItemType } from 'fumadocs-ui/layouts/shared'
import type { JSX } from 'react'
import { Icon } from '../components/icon'
import { messages } from '../messages'
import { npmPackage, repository, version } from '../site'

function Brand(): JSX.Element {
  return (
    <span className="brand">
      <span className="brand-name">{messages.siteName}</span>
      <span className="brand-version">{version}</span>
    </span>
  )
}

const npmLink: LinkItemType = {
  type: 'icon',
  text: messages.npm,
  label: messages.npm,
  icon: <Icon name="npm" />,
  url: npmPackage,
  external: true,
}

const sectionLinks: LinkItemType[] = [
  { text: messages.nav.docs, url: '/docs', active: 'url' },
  { text: messages.nav.api, url: '/docs/api', active: 'nested-url' },
]

const examplesLink: LinkItemType = {
  text: messages.nav.examples,
  url: '/examples',
  active: 'nested-url',
}

const benchmarkLink: LinkItemType = {
  text: messages.nav.benchmark,
  url: '/benchmark',
  active: 'url',
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Brand />, url: '/' },
    githubUrl: repository,
    links: [examplesLink, benchmarkLink, npmLink],
  }
}

export function homeOptions(): BaseLayoutProps {
  return {
    ...baseOptions(),
    links: [...sectionLinks, examplesLink, benchmarkLink, npmLink],
  }
}
