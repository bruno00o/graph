import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { LiveExample } from './live-example'

const components = {
  ...defaultMdxComponents,
  Tab,
  Tabs,
  LiveExample,
} satisfies MDXComponents

export function mdxComponents(): MDXComponents {
  return components
}
