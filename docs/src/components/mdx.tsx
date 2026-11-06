import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { ApiTable } from './api-table'
import { LiveExample } from './live-example'

const components = {
  ...defaultMdxComponents,
  ApiTable,
  Tab,
  Tabs,
  LiveExample,
} satisfies MDXComponents

export function mdxComponents(): MDXComponents {
  return components
}
